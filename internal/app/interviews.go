// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

package app

import (
	"errors"
	"fmt"
	"slices"
)

// ScheduledInterviewKinds are the kinds of real interview the user can schedule
// on a job (mock interview types are in interview_options.go).
var ScheduledInterviewKinds = []string{"phone_screen", "technical", "behavioral", "onsite", "panel", "other"}

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

// ScheduledInterview is an interview with the job it's for, for the calendar.
type ScheduledInterview struct {
	Interview
	Company   string `json:"company"`
	Position  string `json:"position"`
	JobStatus string `json:"jobStatus"`
}

// ListAllInterviews lists every job's interviews, soonest first.
func (r *Repo) ListAllInterviews() ([]ScheduledInterview, error) {
	return queryAll(r.db, func(row rowScanner) (ScheduledInterview, error) {
		var s ScheduledInterview
		err := row.Scan(&s.ID, &s.JobID, &s.Kind, &s.ScheduledAt, &s.DurationMin, &s.LocationOrLink, &s.Notes, &s.Completed, &s.Company, &s.Position, &s.JobStatus)
		return s, err
	}, `SELECT i.id, i.job_id, i.kind, i.scheduled_at, i.duration_min, i.location_or_link, i.notes, i.completed, j.company, j.position, j.status
		FROM interviews i JOIN jobs j ON j.id = i.job_id ORDER BY i.scheduled_at, i.rowid`)
}

func (r *Repo) SaveInterview(iv Interview) (Interview, error) {
	if !slices.Contains(ScheduledInterviewKinds, iv.Kind) {
		return iv, fmt.Errorf("invalid interview kind %q", iv.Kind)
	}
	at, err := parseTS(iv.ScheduledAt)
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
