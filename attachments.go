package main

import (
	"database/sql"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
)

type Attachment struct {
	ID         string `json:"id"`
	JobID      string `json:"jobId"`
	Label      string `json:"label"`
	FileName   string `json:"fileName"`
	StoredPath string `json:"storedPath"`
	AddedAt    string `json:"addedAt"`
}

const attachmentColumns = `id, job_id, label, file_name, stored_path, added_at`

func scanAttachment(s rowScanner) (Attachment, error) {
	var a Attachment
	err := s.Scan(&a.ID, &a.JobID, &a.Label, &a.FileName, &a.StoredPath, &a.AddedAt)
	return a, err
}

// AddAttachment copies srcPath into the job's files folder, so the exact file
// that was sent is preserved even if the original is later edited or deleted.
func (r *Repo) AddAttachment(jobID, srcPath, label string) (Attachment, error) {
	if _, err := r.GetJob(jobID); err != nil {
		return Attachment{}, err
	}
	a := Attachment{ID: newID(), JobID: jobID, FileName: filepath.Base(srcPath), AddedAt: ts(r.now())}
	a.Label = strings.TrimSpace(label)
	if a.Label == "" {
		a.Label = a.FileName
	}
	dir := filepath.Join(r.filesDir, jobID)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return Attachment{}, err
	}
	// The id prefix keeps two files with the same name apart.
	a.StoredPath = filepath.Join(dir, a.ID+"_"+a.FileName)
	if err := copyFile(srcPath, a.StoredPath); err != nil {
		return Attachment{}, fmt.Errorf("copy %s: %w", srcPath, err)
	}
	_, err := r.db.Exec(`INSERT INTO attachments (`+attachmentColumns+`) VALUES (?, ?, ?, ?, ?, ?)`,
		a.ID, a.JobID, a.Label, a.FileName, a.StoredPath, a.AddedAt)
	if err != nil {
		os.Remove(a.StoredPath)
		return Attachment{}, err
	}
	return a, nil
}

func copyFile(src, dst string) error {
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()
	out, err := os.Create(dst)
	if err != nil {
		return err
	}
	if _, err := io.Copy(out, in); err != nil {
		out.Close()
		os.Remove(dst)
		return err
	}
	if err := out.Close(); err != nil {
		os.Remove(dst)
		return err
	}
	return nil
}

func (r *Repo) ListAttachments(jobID string) ([]Attachment, error) {
	rows, err := r.db.Query(`SELECT `+attachmentColumns+` FROM attachments WHERE job_id = ? ORDER BY added_at, rowid`, jobID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Attachment{}
	for rows.Next() {
		a, err := scanAttachment(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, a)
	}
	return out, rows.Err()
}

func (r *Repo) GetAttachment(id string) (Attachment, error) {
	a, err := scanAttachment(r.db.QueryRow(`SELECT `+attachmentColumns+` FROM attachments WHERE id = ?`, id))
	if errors.Is(err, sql.ErrNoRows) {
		return Attachment{}, fmt.Errorf("attachment %s: %w", id, ErrNotFound)
	}
	return a, err
}

func (r *Repo) DeleteAttachment(id string) error {
	a, err := r.GetAttachment(id)
	if err != nil {
		return err
	}
	if _, err := r.db.Exec(`DELETE FROM attachments WHERE id = ?`, id); err != nil {
		return err
	}
	if err := os.Remove(a.StoredPath); err != nil && !errors.Is(err, os.ErrNotExist) {
		return err
	}
	return nil
}
