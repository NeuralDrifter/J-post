// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

package app

import (
	"encoding/base64"
	"fmt"
	"os"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

// Bindings for resumes and cover letters (see resumes.go).

func (a *App) ListDocuments(kind string, trashed bool) ([]Document, error) {
	return a.repo.ListDocuments(kind, trashed)
}

func (a *App) GetDocument(id string) (Document, error) { return a.repo.GetDocument(id) }

func (a *App) CreateDocument(kind, name, data, plainText string) (Document, error) {
	return a.repo.CreateDocument(kind, name, data, plainText)
}

func (a *App) SaveDocument(id, data, plainText, sessionID string) (Document, error) {
	return a.repo.SaveDocument(id, data, plainText, sessionID)
}

func (a *App) RenameDocument(id, name string) error { return a.repo.RenameDocument(id, name) }

func (a *App) DuplicateDocument(id string) (Document, error) { return a.repo.DuplicateDocument(id) }

// TrashDocument moves a document to Trash; trashing the default resume clears the default.
func (a *App) TrashDocument(id string) error {
	if err := a.repo.TrashDocument(id); err != nil {
		return err
	}
	return a.clearDefaultResumeIf(id)
}

func (a *App) RestoreDocument(id string) error { return a.repo.RestoreDocument(id) }

func (a *App) DeleteDocumentForever(id string) error {
	if err := a.repo.DeleteDocumentForever(id); err != nil {
		return err
	}
	return a.clearDefaultResumeIf(id)
}

func (a *App) EmptyTrash(kind string) error { return a.repo.EmptyTrash(kind) }

// SetDefaultResume makes a resume the one AI features read; "" goes back to the uploaded resume.
func (a *App) SetDefaultResume(id string) error {
	s, err := a.settings.Load()
	if err != nil {
		return err
	}
	s.DefaultResumeID = id
	return a.settings.Save(s)
}

func (a *App) clearDefaultResumeIf(id string) error {
	s, err := a.settings.Load()
	if err != nil || s.DefaultResumeID != id {
		return err
	}
	return a.SetDefaultResume("")
}

// LinkJobDocuments records the resume and cover letter sent for a job; "" clears one.
func (a *App) LinkJobDocuments(jobID, resumeID, letterID string) error {
	return a.repo.LinkJobDocuments(jobID, resumeID, letterID)
}

// TailorResumeForJob copies a resume for one job and links the copy to it.
func (a *App) TailorResumeForJob(jobID, resumeID string) (Document, error) {
	return a.repo.TailorResumeForJob(jobID, resumeID)
}

// SaveAtsReport keeps a job's latest ATS check.
func (a *App) SaveAtsReport(jobID, report, source string) error {
	return a.repo.SaveAtsReport(jobID, report, source)
}

// GetAtsReport is a job's latest ATS check, or null before the first.
func (a *App) GetAtsReport(jobID string) (*AtsReport, error) { return a.repo.GetAtsReport(jobID) }

// ReadAttachment returns an attached file (base64), e.g. a PDF to run the ATS check on.
func (a *App) ReadAttachment(id string) (string, error) { return a.repo.ReadAttachment(id) }

// FetchPicture downloads a photo an imported resume links to and returns it as
// a data URL, so the resume keeps the image itself.
func (a *App) FetchPicture(url string) (string, error) {
	return a.pictures.Fetch(a.lifetimeContext(), url)
}

// SaveExportedFile asks where to save an exported document (contentBase64,
// as the browser encodes a Blob) and writes it there. It returns the chosen
// path, or "" if the user cancelled.
func (a *App) SaveExportedFile(suggestedName, contentBase64 string) (string, error) {
	content, err := base64.StdEncoding.DecodeString(contentBase64)
	if err != nil {
		return "", fmt.Errorf("export: %w", err)
	}
	path, err := runtime.SaveFileDialog(a.ctx, runtime.SaveDialogOptions{Title: "Export", DefaultFilename: suggestedName})
	if err != nil || path == "" {
		return "", err
	}
	return path, os.WriteFile(path, content, 0o644)
}

// ListDocumentVersions lists a document's history, newest first, without the content.
func (a *App) ListDocumentVersions(documentID string) ([]DocumentVersion, error) {
	return a.repo.ListDocumentVersions(documentID)
}

func (a *App) GetDocumentVersion(id string) (DocumentVersion, error) {
	return a.repo.GetDocumentVersion(id)
}

func (a *App) NameDocumentVersion(documentID, name string) (DocumentVersion, error) {
	return a.repo.NameDocumentVersion(documentID, name)
}

func (a *App) RenameDocumentVersion(id, name string) error {
	return a.repo.RenameDocumentVersion(id, name)
}

func (a *App) DeleteDocumentVersion(id string) error { return a.repo.DeleteDocumentVersion(id) }

func (a *App) RestoreDocumentVersion(documentID, versionID string) (Document, error) {
	return a.repo.RestoreDocumentVersion(documentID, versionID)
}

// SetDocumentLocked locks a document against edits, or unlocks it.
func (a *App) SetDocumentLocked(id string, locked bool) error {
	return a.repo.SetDocumentLocked(id, locked)
}

// SetLetterSource sets the resume a letter follows and what it takes from it.
func (a *App) SetLetterSource(letterID, resumeID string, senderLinked, designLinked bool) error {
	return a.repo.SetLetterSource(letterID, resumeID, senderLinked, designLinked)
}
