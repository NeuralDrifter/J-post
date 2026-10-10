// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

package app

import (
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"strings"

	"jobtrack/internal/settings"
)

// Document kinds.
const (
	DocumentResume = "resume"
	DocumentLetter = "letter"
)

// maxDocumentBytes caps a document's JSON; a resume with a photo is well under 1 MB.
const maxDocumentBytes = 5 << 20

// Document is a resume or cover letter. Data is Reactive Resume's JSON, owned
// and validated by the frontend; Go only checks it is well-formed JSON.
// PlainText is the frontend's text rendering of it, which AI features read.
type Document struct {
	ID        string `json:"id"`
	Kind      string `json:"kind"`
	Name      string `json:"name"`
	Data      string `json:"data"`
	PlainText string `json:"plainText"`
	SourceID  string `json:"sourceId"` // a tailored copy's original
	JobID     string `json:"jobId"`    // a tailored copy's job
	CreatedAt string `json:"createdAt"`
	UpdatedAt string `json:"updatedAt"`
	DeletedAt string `json:"deletedAt"` // "" unless in Trash
}

const documentColumns = `id, kind, name, data, plain_text, source_id, COALESCE(job_id, ''), created_at, updated_at, deleted_at`

func scanDocument(row rowScanner) (Document, error) {
	var d Document
	err := row.Scan(&d.ID, &d.Kind, &d.Name, &d.Data, &d.PlainText, &d.SourceID, &d.JobID, &d.CreatedAt, &d.UpdatedAt, &d.DeletedAt)
	return d, err
}

func (r *Repo) CreateDocument(kind, name, data, plainText string) (Document, error) {
	name = strings.TrimSpace(name)
	if err := validateDocument(kind, name, data); err != nil {
		return Document{}, err
	}
	now := ts(r.now())
	d := Document{ID: newID(), Kind: kind, Name: name, Data: data, PlainText: plainText, CreatedAt: now, UpdatedAt: now}
	_, err := r.db.Exec(`INSERT INTO documents (id, kind, name, data, plain_text, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
		d.ID, d.Kind, d.Name, d.Data, d.PlainText, d.CreatedAt, d.UpdatedAt)
	return d, err
}

func (r *Repo) GetDocument(id string) (Document, error) {
	d, err := scanDocument(r.db.QueryRow(`SELECT `+documentColumns+` FROM documents WHERE id = ?`, id))
	if errors.Is(err, sql.ErrNoRows) {
		return Document{}, fmt.Errorf("document %s: %w", id, ErrNotFound)
	}
	return d, err
}

// ListDocuments lists one kind, live or in Trash, most recently changed first.
func (r *Repo) ListDocuments(kind string, trashed bool) ([]Document, error) {
	where := `deleted_at = ''`
	if trashed {
		where = `deleted_at != ''`
	}
	return queryAll(r.db, scanDocument, `SELECT `+documentColumns+` FROM documents WHERE kind = ? AND `+where+` ORDER BY updated_at DESC, rowid DESC`, kind)
}

// SaveDocument replaces a document's data and text.
func (r *Repo) SaveDocument(id, data, plainText string) (Document, error) {
	if err := validateDocumentData(data); err != nil {
		return Document{}, err
	}
	res, err := r.db.Exec(`UPDATE documents SET data = ?, plain_text = ?, updated_at = ? WHERE id = ?`, data, plainText, ts(r.now()), id)
	if err := expectOneRow(res, err, "document", id); err != nil {
		return Document{}, err
	}
	return r.GetDocument(id)
}

func (r *Repo) RenameDocument(id, name string) error {
	name = strings.TrimSpace(name)
	if name == "" {
		return errors.New("a document needs a name")
	}
	res, err := r.db.Exec(`UPDATE documents SET name = ?, updated_at = ? WHERE id = ?`, name, ts(r.now()), id)
	return expectOneRow(res, err, "document", id)
}

// DuplicateDocument copies a document's content under "Copy of <name>".
func (r *Repo) DuplicateDocument(id string) (Document, error) {
	original, err := r.GetDocument(id)
	if err != nil {
		return Document{}, err
	}
	return r.CreateDocument(original.Kind, "Copy of "+original.Name, original.Data, original.PlainText)
}

func (r *Repo) TrashDocument(id string) error {
	return r.setDeletedAt(id, ts(r.now()))
}

func (r *Repo) RestoreDocument(id string) error {
	return r.setDeletedAt(id, "")
}

func (r *Repo) setDeletedAt(id, deletedAt string) error {
	res, err := r.db.Exec(`UPDATE documents SET deleted_at = ? WHERE id = ?`, deletedAt, id)
	return expectOneRow(res, err, "document", id)
}

// DeleteDocumentForever removes a document and unlinks it from every job.
func (r *Repo) DeleteDocumentForever(id string) error {
	tx, err := r.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if err := unlinkDocuments(tx, `id = ?`, id); err != nil {
		return err
	}
	res, err := tx.Exec(`DELETE FROM documents WHERE id = ?`, id)
	if err := expectOneRow(res, err, "document", id); err != nil {
		return err
	}
	return tx.Commit()
}

// EmptyTrash deletes every trashed document of one kind.
func (r *Repo) EmptyTrash(kind string) error {
	tx, err := r.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	const trashedOfKind = `kind = ? AND deleted_at != ''`
	if err := unlinkDocuments(tx, trashedOfKind, kind); err != nil {
		return err
	}
	if _, err := tx.Exec(`DELETE FROM documents WHERE `+trashedOfKind, kind); err != nil {
		return err
	}
	return tx.Commit()
}

// unlinkDocuments clears the job links to the documents matching where.
func unlinkDocuments(tx *sql.Tx, where string, args ...any) error {
	ids := `SELECT id FROM documents WHERE ` + where
	if _, err := tx.Exec(`UPDATE jobs SET resume_id = '' WHERE resume_id IN (`+ids+`)`, args...); err != nil {
		return err
	}
	_, err := tx.Exec(`UPDATE jobs SET letter_id = '' WHERE letter_id IN (`+ids+`)`, args...)
	return err
}

// LinkJobDocuments records the resume and cover letter sent for a job; "" clears one.
func (r *Repo) LinkJobDocuments(jobID, resumeID, letterID string) error {
	for _, link := range []struct{ id, kind string }{{resumeID, DocumentResume}, {letterID, DocumentLetter}} {
		if err := r.requireDocumentKind(link.id, link.kind); err != nil {
			return err
		}
	}
	res, err := r.db.Exec(`UPDATE jobs SET resume_id = ?, letter_id = ?, updated_at = ? WHERE id = ?`, resumeID, letterID, ts(r.now()), jobID)
	return expectOneRow(res, err, "job", jobID)
}

func (r *Repo) requireDocumentKind(id, kind string) error {
	if id == "" {
		return nil
	}
	doc, err := r.GetDocument(id)
	if err != nil {
		return err
	}
	if doc.Kind != kind {
		return fmt.Errorf("document %s is a %s, not a %s", id, doc.Kind, kind)
	}
	return nil
}

// TailorResumeForJob copies a resume as "<name> · <company>", marks the copy as
// that job's, and links it to the job, ready to adjust for this application.
func (r *Repo) TailorResumeForJob(jobID, resumeID string) (Document, error) {
	job, err := r.GetJob(jobID)
	if err != nil {
		return Document{}, err
	}
	original, err := r.GetDocument(resumeID)
	if err != nil {
		return Document{}, err
	}
	if original.Kind != DocumentResume {
		return Document{}, fmt.Errorf("document %s is not a resume", resumeID)
	}
	tx, err := r.db.Begin()
	if err != nil {
		return Document{}, err
	}
	defer tx.Rollback()
	copy, err := insertTailoredCopy(tx, original, job, ts(r.now()))
	if err != nil {
		return Document{}, err
	}
	if _, err := tx.Exec(`UPDATE jobs SET resume_id = ?, updated_at = ? WHERE id = ?`, copy.ID, copy.CreatedAt, jobID); err != nil {
		return Document{}, err
	}
	return copy, tx.Commit()
}

func insertTailoredCopy(tx *sql.Tx, original Document, job Job, now string) (Document, error) {
	copy := original
	copy.ID, copy.Name, copy.SourceID, copy.JobID = newID(), original.Name+" · "+job.Company, original.ID, job.ID
	copy.CreatedAt, copy.UpdatedAt, copy.DeletedAt = now, now, ""
	_, err := tx.Exec(`INSERT INTO documents (id, kind, name, data, plain_text, source_id, job_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		copy.ID, copy.Kind, copy.Name, copy.Data, copy.PlainText, copy.SourceID, copy.JobID, copy.CreatedAt, copy.UpdatedAt)
	return copy, err
}

// resumeTextFor is the resume text AI features read: the given resume, else
// the default resume, else the uploaded resume. Trashed resumes are skipped.
func (r *Repo) resumeTextFor(s settings.Settings, resumeID string) (string, error) {
	for _, id := range []string{resumeID, s.DefaultResumeID} {
		text, found, err := r.liveResumeText(id)
		if err != nil || found {
			return text, err
		}
	}
	profile, err := r.GetProfile()
	return profile.ResumeText, err
}

func (r *Repo) liveResumeText(id string) (text string, found bool, err error) {
	if id == "" {
		return "", false, nil
	}
	err = r.db.QueryRow(`SELECT plain_text FROM documents WHERE id = ? AND kind = ? AND deleted_at = ''`, id, DocumentResume).Scan(&text)
	if errors.Is(err, sql.ErrNoRows) {
		return "", false, nil
	}
	return text, err == nil, err
}

func validateDocument(kind, name, data string) error {
	if kind != DocumentResume && kind != DocumentLetter {
		return fmt.Errorf("unknown document kind %q", kind)
	}
	if name == "" {
		return errors.New("a document needs a name")
	}
	return validateDocumentData(data)
}

func validateDocumentData(data string) error {
	return validateJSON(data, maxDocumentBytes, "document")
}

// validateJSON checks that what the frontend stores is well-formed JSON within a size limit.
func validateJSON(data string, limit int, what string) error {
	if len(data) > limit {
		return fmt.Errorf("%s is %d MB; the limit is %d MB", what, len(data)>>20, limit>>20)
	}
	if !json.Valid([]byte(data)) {
		return fmt.Errorf("%s is not valid JSON", what)
	}
	return nil
}
