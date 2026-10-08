// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

package licensegen

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
)

// ShippedBuildTools are dev dependencies whose output ends up in the app:
// Tailwind's base CSS and Vite's small runtime helpers.
var ShippedBuildTools = []string{"tailwindcss", "vite"}

// File is the generated licenses.json the frontend imports.
type File struct {
	App Entry   `json:"app"` // Job Track's own license
	Go  []Entry `json:"go"`
	Npm []Entry `json:"npm"`
}

// CollectApp reads Job Track's own LICENSE at the repository root.
func CollectApp(repoRoot string) (Entry, error) {
	text, ok := FindLicenseText(repoRoot)
	if !ok {
		return Entry{}, errors.New("no LICENSE file at the repository root")
	}
	return Entry{Name: "Job Track", License: DetectLicense(text), URL: "https://github.com/NeuralDrifter", Text: text}, nil
}

// Write saves Job Track's license and both library lists, sorted, as indented JSON.
func Write(path string, app Entry, goEntries, npmEntries []Entry) error {
	f := File{App: app, Go: goEntries, Npm: npmEntries}
	if f.Go == nil {
		f.Go = []Entry{}
	}
	if f.Npm == nil {
		f.Npm = []Entry{}
	}
	sortEntries(f.Go)
	sortEntries(f.Npm)
	data, err := json.MarshalIndent(f, "", "  ")
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	return os.WriteFile(path, append(data, '\n'), 0o644)
}

// Read loads a generated licenses.json.
func Read(path string) (File, error) {
	var f File
	data, err := os.ReadFile(path)
	if err != nil {
		return f, err
	}
	err = json.Unmarshal(data, &f)
	return f, err
}
