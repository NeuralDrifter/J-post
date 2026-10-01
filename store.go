package main

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"os"
	"path/filepath"
	"sync"
	"time"
)

type JobApplication struct {
	ID          string    `json:"id"`
	Company     string    `json:"company"`
	Position    string    `json:"position"`
	Status      string    `json:"status"` // "Wishlist", "Applied", "Interviewing", "Offer", "Rejected"
	DateApplied string    `json:"dateApplied"`
	Notes       string    `json:"notes"`
	UpdatedAt   time.Time `json:"updatedAt"`
}

type Store struct {
	mu       sync.Mutex
	filePath string
}

func NewStore() *Store {
	homeDir, _ := os.UserHomeDir()
	appDir := filepath.Join(homeDir, ".jobtrack")
	os.MkdirAll(appDir, os.ModePerm)
	return &Store{
		filePath: filepath.Join(appDir, "data.json"),
	}
}

func (s *Store) load() ([]JobApplication, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	data, err := os.ReadFile(s.filePath)
	if err != nil {
		if os.IsNotExist(err) {
			return []JobApplication{}, nil
		}
		return nil, err
	}

	var apps []JobApplication
	if err := json.Unmarshal(data, &apps); err != nil {
		return nil, err
	}

	return apps, nil
}

func (s *Store) save(apps []JobApplication) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	data, err := json.MarshalIndent(apps, "", "  ")
	if err != nil {
		return err
	}

	return os.WriteFile(s.filePath, data, 0644)
}

func generateID() string {
	bytes := make([]byte, 8)
	if _, err := rand.Read(bytes); err != nil {
		return time.Now().Format("20060102150405")
	}
	return hex.EncodeToString(bytes)
}
