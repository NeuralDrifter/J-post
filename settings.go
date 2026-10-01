package main

import (
	"encoding/json"
	"os"
	"path/filepath"
	"sync"
)

type Settings struct {
	AdzunaAppID  string `json:"adzunaAppId"`
	AdzunaAppKey string `json:"adzunaAppKey"`
}

type SettingsStore struct {
	mu       sync.Mutex
	filePath string
}

func NewSettingsStore() *SettingsStore {
	homeDir, _ := os.UserHomeDir()
	appDir := filepath.Join(homeDir, ".jobtrack")
	os.MkdirAll(appDir, os.ModePerm)
	return &SettingsStore{
		filePath: filepath.Join(appDir, "settings.json"),
	}
}

func (s *SettingsStore) Load() (Settings, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	var settings Settings
	data, err := os.ReadFile(s.filePath)
	if err != nil {
		if os.IsNotExist(err) {
			return settings, nil
		}
		return settings, err
	}

	if err := json.Unmarshal(data, &settings); err != nil {
		return settings, err
	}

	return settings, nil
}

func (s *SettingsStore) Save(settings Settings) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	data, err := json.MarshalIndent(settings, "", "  ")
	if err != nil {
		return err
	}

	return os.WriteFile(s.filePath, data, 0644)
}
