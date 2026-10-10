// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

package app

import (
	"database/sql"
	"encoding/base64"
	"errors"
	"fmt"
	"os"
)

// maxAtsReportBytes caps a stored report; real ones are a few kilobytes.
const maxAtsReportBytes = 2 << 20

// maxAttachmentReadBytes caps a file read back for checking; resumes are far smaller.
const maxAttachmentReadBytes = 25 << 20

// AtsReport is a job's latest ATS check: Reactive Resume's report as JSON (the
// frontend owns its shape), what was checked, and when.
type AtsReport struct {
	JobID     string `json:"jobId"`
	Report    string `json:"report"`
	Source    string `json:"source"` // e.g. the resume's name, or an attached file's
	CheckedAt string `json:"checkedAt"`
}

// SaveAtsReport keeps a job's latest check, replacing the one before.
func (r *Repo) SaveAtsReport(jobID, report, source string) error {
	if err := validateJSON(report, maxAtsReportBytes, "ATS report"); err != nil {
		return err
	}
	if _, err := r.GetJob(jobID); err != nil {
		return err
	}
	_, err := r.db.Exec(`INSERT OR REPLACE INTO ats_reports (job_id, report, source, checked_at) VALUES (?, ?, ?, ?)`, jobID, report, source, ts(r.now()))
	return err
}

// GetAtsReport is a job's latest check, or nil before the first.
func (r *Repo) GetAtsReport(jobID string) (*AtsReport, error) {
	report := AtsReport{JobID: jobID}
	err := r.db.QueryRow(`SELECT report, source, checked_at FROM ats_reports WHERE job_id = ?`, jobID).Scan(&report.Report, &report.Source, &report.CheckedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &report, nil
}

// ReadAttachment returns an attached file's stored copy, base64-encoded, for checking it.
func (r *Repo) ReadAttachment(id string) (string, error) {
	att, err := r.GetAttachment(id)
	if err != nil {
		return "", err
	}
	info, err := os.Stat(att.StoredPath)
	if err != nil {
		return "", err
	}
	if info.Size() > maxAttachmentReadBytes {
		return "", fmt.Errorf("%s is over %d MB", att.FileName, maxAttachmentReadBytes>>20)
	}
	data, err := os.ReadFile(att.StoredPath)
	return base64.StdEncoding.EncodeToString(data), err
}
