package main

import (
	"errors"
	"fmt"
	"time"
)

var validInterviewKinds = map[string]bool{
	"phone_screen": true, "technical": true, "behavioral": true, "onsite": true, "panel": true, "other": true,
}

type Interview struct {
	ID             string `json:"id"`
	JobID          string `json:"jobId"`
	Kind           string `json:"kind"`
	ScheduledAt    string `json:"scheduledAt"`
	DurationMin    int    `json:"durationMin"`
	LocationOrLink string `json:"locationOrLink"`
	Notes          string `json:"notes"`
	Completed      bool   `json:"completed"`
}

const interviewColumns = `id, job_id, kind, scheduled_at, duration_min, location_or_link, notes, completed`

func scanInterview(s rowScanner) (Interview, error) {
	var iv Interview
	err := s.Scan(&iv.ID, &iv.JobID, &iv.Kind, &iv.ScheduledAt, &iv.DurationMin, &iv.LocationOrLink, &iv.Notes, &iv.Completed)
	return iv, err
}

// ListInterviews returns upcoming (not completed) interviews first, each group by time.
func (r *Repo) ListInterviews(jobID string) ([]Interview, error) {
	return queryAll(r.db, scanInterview, `SELECT `+interviewColumns+` FROM interviews WHERE job_id = ? ORDER BY completed, scheduled_at`, jobID)
}

func (r *Repo) SaveInterview(iv Interview) (Interview, error) {
	if !validInterviewKinds[iv.Kind] {
		return iv, fmt.Errorf("invalid interview kind %q", iv.Kind)
	}
	at, err := time.Parse(time.RFC3339, iv.ScheduledAt)
	if err != nil {
		return iv, fmt.Errorf("invalid interview time %q", iv.ScheduledAt)
	}
	iv.ScheduledAt = ts(at)
	if iv.DurationMin < 0 {
		return iv, errors.New("duration can't be negative")
	}
	if iv.ID == "" {
		if _, err := r.GetJob(iv.JobID); err != nil {
			return iv, err
		}
		iv.ID = newID()
		_, err := r.db.Exec(`INSERT INTO interviews (`+interviewColumns+`) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
			iv.ID, iv.JobID, iv.Kind, iv.ScheduledAt, iv.DurationMin, iv.LocationOrLink, iv.Notes, iv.Completed)
		return iv, err
	}
	res, err := r.db.Exec(`UPDATE interviews SET kind = ?, scheduled_at = ?, duration_min = ?, location_or_link = ?, notes = ?, completed = ? WHERE id = ?`,
		iv.Kind, iv.ScheduledAt, iv.DurationMin, iv.LocationOrLink, iv.Notes, iv.Completed, iv.ID)
	return iv, expectOneRow(res, err, "interview", iv.ID)
}

func (r *Repo) DeleteInterview(id string) error {
	res, err := r.db.Exec(`DELETE FROM interviews WHERE id = ?`, id)
	return expectOneRow(res, err, "interview", id)
}
