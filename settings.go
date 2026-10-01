package main

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"sync"
)

const defaultFollowUpDays = 7

type Settings struct {
	AdzunaAppID     string `json:"adzunaAppId"`
	AdzunaAppKey    string `json:"adzunaAppKey"`
	PythonPath      string `json:"pythonPath"`
	FollowUpDays    int    `json:"followUpDays"`
	WindowWidth     int    `json:"windowWidth"`
	WindowHeight    int    `json:"windowHeight"`
	WindowMaximised bool   `json:"windowMaximised"`
}

type SettingsStore struct {
	mu       sync.Mutex
	filePath string
}

// defaultDataDir is where the app keeps its database, settings and files.
// JOBTRACK_DATA_DIR overrides it (handy for testing against a scratch folder).
func defaultDataDir() string {
	if dir := os.Getenv("JOBTRACK_DATA_DIR"); dir != "" {
		return dir
	}
	home, err := os.UserHomeDir()
	if err != nil {
		home = "."
	}
	return filepath.Join(home, ".jobtrack")
}

func NewSettingsStore(dir string) *SettingsStore {
	return &SettingsStore{filePath: filepath.Join(dir, "settings.json")}
}

func (s *SettingsStore) Load() (Settings, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	var settings Settings
	data, err := os.ReadFile(s.filePath)
	if err != nil && !errors.Is(err, os.ErrNotExist) {
		return settings, err
	}
	if err == nil {
		if err := json.Unmarshal(data, &settings); err != nil {
			return settings, err
		}
	}
	if settings.FollowUpDays <= 0 {
		settings.FollowUpDays = defaultFollowUpDays
	}
	return settings, nil
}

// Save writes atomically (temp file + rename) so a crash can't leave a
// half-written settings file. 0600 because it holds API keys.
func (s *SettingsStore) Save(settings Settings) error {
	if settings.FollowUpDays <= 0 {
		settings.FollowUpDays = defaultFollowUpDays
	}
	if settings.FollowUpDays > 365 {
		return errors.New("follow-up threshold must be between 1 and 365 days")
	}
	data, err := json.MarshalIndent(settings, "", "  ")
	if err != nil {
		return err
	}

	s.mu.Lock()
	defer s.mu.Unlock()
	if err := os.MkdirAll(filepath.Dir(s.filePath), 0o755); err != nil {
		return err
	}
	tmp := s.filePath + ".tmp"
	if err := os.WriteFile(tmp, data, 0o600); err != nil {
		return err
	}
	if err := os.Rename(tmp, s.filePath); err != nil {
		os.Remove(tmp)
		return err
	}
	return nil
}
