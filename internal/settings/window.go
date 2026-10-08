// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

package settings

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"sync"
)

// WindowState is the main window's size at the end of the last session. Only
// the app writes it, so it lives apart from the user's Settings.
type WindowState struct {
	Width     int  `json:"width"`
	Height    int  `json:"height"`
	Maximised bool `json:"maximised"`
}

type WindowStateStore struct {
	mu         sync.Mutex
	filePath   string
	legacyPath string // settings.json, which held these fields before window.json existed
}

func NewWindowStateStore(dir string) *WindowStateStore {
	return &WindowStateStore{filePath: filepath.Join(dir, "window.json"), legacyPath: filepath.Join(dir, "settings.json")}
}

// Load returns the saved state, the old copy inside settings.json if there's no
// window.json yet, or the zero state (meaning "pick a size for this screen").
func (s *WindowStateStore) Load() (WindowState, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	var w WindowState
	data, err := os.ReadFile(s.filePath)
	if errors.Is(err, os.ErrNotExist) {
		return s.loadLegacy()
	}
	if err != nil {
		return w, err
	}
	return w, json.Unmarshal(data, &w)
}

func (s *WindowStateStore) loadLegacy() (WindowState, error) {
	var legacy struct {
		Width     int  `json:"windowWidth"`
		Height    int  `json:"windowHeight"`
		Maximised bool `json:"windowMaximised"`
	}
	data, err := os.ReadFile(s.legacyPath)
	if errors.Is(err, os.ErrNotExist) {
		return WindowState{}, nil
	}
	if err != nil {
		return WindowState{}, err
	}
	if err := json.Unmarshal(data, &legacy); err != nil {
		return WindowState{}, err
	}
	return WindowState{Width: legacy.Width, Height: legacy.Height, Maximised: legacy.Maximised}, nil
}

func (s *WindowStateStore) Save(w WindowState) error {
	data, err := json.MarshalIndent(w, "", "  ")
	if err != nil {
		return err
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	return writeFileAtomic(s.filePath, data, 0o644)
}
