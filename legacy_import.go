// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"os"
	"strings"
	"time"
)

// legacyApplication is the record shape of the old ~/.jobtrack/data.json store.
type legacyApplication struct {
	Company     string    `json:"company"`
	Position    string    `json:"position"`
	Status      string    `json:"status"`
	DateApplied string    `json:"dateApplied"`
	Notes       string    `json:"notes"`
	UpdatedAt   time.Time `json:"updatedAt"`
}

func mapLegacyStatus(s string) (status, reason string) {
	switch strings.ToLower(strings.TrimSpace(s)) {
	case StatusInterested, "wishlist":
		return StatusInterested, ""
	case StatusApplied:
		return StatusApplied, ""
	case StatusInterviewing:
		return StatusInterviewing, ""
	case StatusOffer:
		return StatusOffer, ""
	case "rejected":
		return StatusClosed, "rejected"
	default:
		return StatusInterested, ""
	}
}

// ImportLegacy moves the old JSON store into the database once: only when the
// file exists and the jobs table is empty. On success the file is renamed to
// data.json.bak; on failure nothing is written or renamed.
func (r *Repo) ImportLegacy(jsonPath string) (int, error) {
	data, err := os.ReadFile(jsonPath)
	if errors.Is(err, os.ErrNotExist) {
		return 0, nil
	}
	if err != nil {
		return 0, err
	}
	var existing int
	if err := r.db.QueryRow(`SELECT COUNT(*) FROM jobs`).Scan(&existing); err != nil {
		return 0, err
	}
	if existing > 0 {
		return 0, nil
	}
	var apps []legacyApplication
	if err := json.Unmarshal(data, &apps); err != nil {
		return 0, fmt.Errorf("read %s: %w", jsonPath, err)
	}

	tx, err := r.db.Begin()
	if err != nil {
		return 0, err
	}
	defer tx.Rollback()
	for _, a := range apps {
		status, reason := mapLegacyStatus(a.Status)
		dateApplied := strings.TrimSpace(a.DateApplied)
		if _, err := time.Parse(dateLayout, dateApplied); err != nil {
			dateApplied = ""
		}
		at := a.UpdatedAt
		if at.IsZero() {
			at = r.now()
		}
		stamp := ts(at)
		id := newID()
		_, err := tx.Exec(`INSERT INTO jobs (id, company, position, status, close_reason, date_applied, notes, source, created_at, updated_at)
			VALUES (?, ?, ?, ?, ?, ?, ?, 'manual', ?, ?)`,
			id, orDefault(a.Company, "(unknown company)"), orDefault(a.Position, "(unknown position)"),
			status, reason, dateApplied, a.Notes, stamp, stamp)
		if err != nil {
			return 0, err
		}
		if status == StatusClosed && dateApplied != "" {
			// Record the application too, so old rejections count in the response rate.
			applied, _ := time.ParseInLocation(dateLayout, dateApplied, time.Local)
			if err := insertStageEvent(tx, id, "", StatusApplied, "", ts(applied), "imported"); err != nil {
				return 0, err
			}
			if err := insertStageEvent(tx, id, StatusApplied, status, reason, stamp, "imported"); err != nil {
				return 0, err
			}
			continue
		}
		if err := insertStageEvent(tx, id, "", status, reason, stamp, "imported"); err != nil {
			return 0, err
		}
	}
	if err := tx.Commit(); err != nil {
		return 0, err
	}
	if err := os.Rename(jsonPath, jsonPath+".bak"); err != nil {
		// Data is safely imported; the non-empty jobs table prevents a re-import.
		log.Printf("imported %s but could not rename it: %v", jsonPath, err)
	}
	return len(apps), nil
}
