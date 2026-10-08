package licensegen

import (
	"encoding/json"
	"os"
	"path/filepath"
)

// ShippedBuildTools are dev dependencies whose output ends up in the app:
// Tailwind's base CSS and Vite's small runtime helpers.
var ShippedBuildTools = []string{"tailwindcss", "vite"}

// File is the generated licenses.json the frontend imports.
type File struct {
	Go  []Entry `json:"go"`
	Npm []Entry `json:"npm"`
}

// Write saves both lists, sorted, as indented JSON.
func Write(path string, goEntries, npmEntries []Entry) error {
	f := File{Go: goEntries, Npm: npmEntries}
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
