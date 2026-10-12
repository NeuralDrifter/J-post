// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

package app

import (
	"database/sql"
	"errors"
	"fmt"
	"strings"
	"time"
)

// Version kinds, as Reactive Resume names them.
const (
	VersionCreated       = "created"
	VersionAuto          = "auto" // one per editing session
	VersionNamed         = "named"
	VersionBeforeRestore = "before-restore"
	VersionRestored      = "restored"
	VersionBeforeAI      = "before-ai" // the document just before an AI run's first accepted change
	VersionAI            = "ai"        // changes accepted from an AI run, named like a commit message
)

const (
	// An editing session's autosave is refreshed at most this often.
	sessionRefresh = 2 * time.Minute
	// Expiring kinds (autosaves and restore markers) are kept this long; the rest stay until deleted.
	versionRetention = 90 * 24 * time.Hour
	// A cap on autosaves per document, so history stays bounded however often it's edited.
	maxAutosaves = 500
	// How many recent expiring versions the history lists; the others always show.
	versionListLimit = 100
)

const expiringKinds = `('` + VersionAuto + `', '` + VersionBeforeRestore + `', '` + VersionRestored + `')`

// DocumentVersion is a snapshot of a document. Lists leave Data and PlainText
// empty; GetDocumentVersion fills them.
type DocumentVersion struct {
	ID         string `json:"id"`
	DocumentID string `json:"documentId"`
	Kind       string `json:"kind"`
	Name       string `json:"name"`
	Data       string `json:"data"`
	PlainText  string `json:"plainText"`
	CreatedAt  string `json:"createdAt"`
}

const versionSummaryColumns = `id, document_id, kind, name, '', '', created_at`
const versionColumns = `id, document_id, kind, name, data, plain_text, created_at`

func scanVersion(row rowScanner) (DocumentVersion, error) {
	var v DocumentVersion
	err := row.Scan(&v.ID, &v.DocumentID, &v.Kind, &v.Name, &v.Data, &v.PlainText, &v.CreatedAt)
	return v, err
}

// ListDocumentVersions lists a document's history, newest first: every kept
// version, and the most recent expiring ones.
func (r *Repo) ListDocumentVersions(documentID string) ([]DocumentVersion, error) {
	if _, err := r.GetDocument(documentID); err != nil {
		return nil, err
	}
	recentExpiring := `SELECT id FROM document_versions WHERE document_id = ? AND kind IN ` + expiringKinds + ` ORDER BY created_at DESC LIMIT ?`
	return queryAll(r.db, scanVersion, `SELECT `+versionSummaryColumns+` FROM document_versions
		WHERE document_id = ? AND (kind NOT IN `+expiringKinds+` OR id IN (`+recentExpiring+`))
		ORDER BY created_at DESC, rowid DESC`, documentID, documentID, versionListLimit)
}

func (r *Repo) GetDocumentVersion(id string) (DocumentVersion, error) {
	v, err := scanVersion(r.db.QueryRow(`SELECT `+versionColumns+` FROM document_versions WHERE id = ?`, id))
	if errors.Is(err, sql.ErrNoRows) {
		return DocumentVersion{}, fmt.Errorf("version %s: %w", id, ErrNotFound)
	}
	return v, err
}

// NameDocumentVersion keeps the document as it is now under a name, until deleted.
func (r *Repo) NameDocumentVersion(documentID, name string) (DocumentVersion, error) {
	name = strings.TrimSpace(name)
	if name == "" {
		return DocumentVersion{}, errors.New("a version needs a name")
	}
	doc, err := r.GetDocument(documentID)
	if err != nil {
		return DocumentVersion{}, err
	}
	v := DocumentVersion{ID: newID(), DocumentID: doc.ID, Kind: VersionNamed, Name: name, CreatedAt: ts(r.now())}
	return v, insertVersion(r.db, v, doc.Data, doc.PlainText, "")
}

// CommitAIVersion keeps a snapshot the builder took around accepting AI
// changes: the document just before (before-ai) or with them (ai, named for
// what changed). Both are kept until the document is deleted.
func (r *Repo) CommitAIVersion(documentID, kind, name, data, plainText string) (DocumentVersion, error) {
	if kind != VersionAI && kind != VersionBeforeAI {
		return DocumentVersion{}, fmt.Errorf("unknown AI version kind %q", kind)
	}
	if err := validateDocumentData(data); err != nil {
		return DocumentVersion{}, err
	}
	if err := r.checkEditable(documentID); err != nil {
		return DocumentVersion{}, err
	}
	v := DocumentVersion{ID: newID(), DocumentID: documentID, Kind: kind, Name: strings.TrimSpace(name), CreatedAt: ts(r.now())}
	return v, insertVersion(r.db, v, data, plainText, "")
}

// RenameDocumentVersion renames a named version; other kinds have no name to change.
func (r *Repo) RenameDocumentVersion(id, name string) error {
	name = strings.TrimSpace(name)
	if name == "" {
		return errors.New("a version needs a name")
	}
	res, err := r.db.Exec(`UPDATE document_versions SET name = ? WHERE id = ? AND kind = ?`, name, id, VersionNamed)
	return expectOneRow(res, err, "named version", id)
}

// DeleteDocumentVersion deletes a named version; the others expire on their own.
func (r *Repo) DeleteDocumentVersion(id string) error {
	res, err := r.db.Exec(`DELETE FROM document_versions WHERE id = ? AND kind = ?`, id, VersionNamed)
	return expectOneRow(res, err, "named version", id)
}

// RestoreDocumentVersion puts a version's content back. The current content is
// kept first as "before-restore", so a restore can itself be undone.
func (r *Repo) RestoreDocumentVersion(documentID, versionID string) (Document, error) {
	current, err := r.GetDocument(documentID)
	if err != nil {
		return Document{}, err
	}
	if current.Locked {
		return Document{}, lockedError(current.ID)
	}
	version, err := r.GetDocumentVersion(versionID)
	if err != nil || version.DocumentID != documentID {
		return Document{}, fmt.Errorf("version %s of document %s: %w", versionID, documentID, ErrNotFound)
	}
	if err := r.restoreInTx(current, version); err != nil {
		return Document{}, err
	}
	return r.GetDocument(documentID)
}

func (r *Repo) restoreInTx(current Document, version DocumentVersion) error {
	tx, err := r.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	now := r.now()
	before := DocumentVersion{ID: newID(), DocumentID: current.ID, Kind: VersionBeforeRestore, CreatedAt: ts(now)}
	if err := insertVersion(tx, before, current.Data, current.PlainText, ""); err != nil {
		return err
	}
	if _, err := tx.Exec(`UPDATE documents SET data = ?, plain_text = ?, updated_at = ? WHERE id = ?`, version.Data, version.PlainText, ts(now), current.ID); err != nil {
		return err
	}
	// A millisecond later, so the history lists the restore after what it replaced.
	restored := DocumentVersion{ID: newID(), DocumentID: current.ID, Kind: VersionRestored, CreatedAt: ts(now.Add(time.Millisecond))}
	if err := insertVersion(tx, restored, version.Data, version.PlainText, ""); err != nil {
		return err
	}
	return tx.Commit()
}

// saveSessionVersion keeps one autosave per editing session, refreshed at most
// every two minutes. Without a session, a new autosave is written once the
// newest version is two minutes old.
func (r *Repo) saveSessionVersion(doc Document, sessionID string) error {
	now := r.now()
	latestID, latestAt, err := r.latestVersion(doc.ID, sessionID)
	if err != nil {
		return err
	}
	if latestID != "" && now.Sub(latestAt) < sessionRefresh {
		return nil
	}
	if latestID != "" && sessionID != "" {
		_, err := r.db.Exec(`UPDATE document_versions SET data = ?, plain_text = ?, created_at = ? WHERE id = ?`, doc.Data, doc.PlainText, ts(now), latestID)
		return err
	}
	v := DocumentVersion{ID: newID(), DocumentID: doc.ID, Kind: VersionAuto, CreatedAt: ts(now)}
	if err := insertVersion(r.db, v, doc.Data, doc.PlainText, sessionID); err != nil {
		return err
	}
	return r.pruneVersions(doc.ID)
}

// latestVersion is the session's autosave, or with no session the newest version of any kind ("" when none).
func (r *Repo) latestVersion(documentID, sessionID string) (id string, createdAt time.Time, err error) {
	query, args := `SELECT id, created_at FROM document_versions WHERE document_id = ?`, []any{documentID}
	if sessionID != "" {
		query, args = query+` AND kind = ? AND session_id = ?`, append(args, VersionAuto, sessionID)
	}
	var at string
	err = r.db.QueryRow(query+` ORDER BY created_at DESC LIMIT 1`, args...).Scan(&id, &at)
	if errors.Is(err, sql.ErrNoRows) {
		return "", time.Time{}, nil
	}
	if err != nil {
		return "", time.Time{}, err
	}
	createdAt, err = parseTS(at)
	return id, createdAt, err
}

// pruneVersions drops expiring versions past retention and autosaves past the cap.
func (r *Repo) pruneVersions(documentID string) error {
	cutoff := ts(r.now().Add(-versionRetention))
	if _, err := r.db.Exec(`DELETE FROM document_versions WHERE document_id = ? AND kind IN `+expiringKinds+` AND created_at < ?`, documentID, cutoff); err != nil {
		return err
	}
	_, err := r.db.Exec(`DELETE FROM document_versions WHERE document_id = ? AND kind = ? AND id NOT IN (
		SELECT id FROM document_versions WHERE document_id = ? AND kind = ? ORDER BY created_at DESC LIMIT ?)`,
		documentID, VersionAuto, documentID, VersionAuto, maxAutosaves)
	return err
}

func insertVersion(db execer, v DocumentVersion, data, plainText, sessionID string) error {
	_, err := db.Exec(`INSERT INTO document_versions (id, document_id, kind, name, data, plain_text, session_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
		v.ID, v.DocumentID, v.Kind, v.Name, data, plainText, sessionID, v.CreatedAt)
	return err
}
