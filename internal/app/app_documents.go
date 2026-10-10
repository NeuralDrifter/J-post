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

func (a *App) SaveDocument(id, data, plainText string) (Document, error) {
	return a.repo.SaveDocument(id, data, plainText)
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
