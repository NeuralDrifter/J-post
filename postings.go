// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

package main

import (
	"database/sql"
	"errors"
	"fmt"
	"slices"
	"strings"
	"time"

	"jobtrack/internal/discover"
)

// Posting states: new → seen (opened) → saved (on the pipeline) or dismissed (not interested).
const (
	PostingNew       = "new"
	PostingSeen      = "seen"
	PostingSaved     = "saved"
	PostingDismissed = "dismissed"
)

// Posting is a job listing found by Discover and kept in the inbox.
type Posting struct {
	ID          string   `json:"id"`
	DedupeKey   string   `json:"dedupeKey"`
	URL         string   `json:"url"`
	Title       string   `json:"title"`
	Company     string   `json:"company"`
	Location    string   `json:"location"`
	WorkMode    string   `json:"workMode"`
	SalaryMin   *int64   `json:"salaryMin,omitempty"`
	SalaryMax   *int64   `json:"salaryMax,omitempty"`
	SalaryText  string   `json:"salaryText"`
	Annualized  bool     `json:"annualized"`
	Description string   `json:"description"`
	DatePosted  string   `json:"datePosted"`
	Sources     []string `json:"sources"`
	State       string   `json:"state"`
	JobID       string   `json:"jobId"`
	JobStatus   string   `json:"jobStatus"`
	SearchID    string   `json:"searchId"`
	FirstSeen   string   `json:"firstSeen"`
	LastSeen    string   `json:"lastSeen"`
	DismissedAt string   `json:"dismissedAt"`
}

type PostingFilter struct {
	Tab     string `json:"tab"` // inbox, saved, dismissed
	Query   string `json:"query"`
	Source  string `json:"source"`
	OnlyNew bool   `json:"onlyNew"`
}

type InboxCounts struct {
	New       int `json:"new"`
	Inbox     int `json:"inbox"`
	Saved     int `json:"saved"`
	Dismissed int `json:"dismissed"`
}

const postingColumns = `p.id, p.dedupe_key, p.url, p.title, p.company, p.location, p.work_mode, p.salary_min, p.salary_max,
	p.salary_text, p.annualized, p.description, p.date_posted, p.sources, p.state, p.job_id, p.search_id,
	p.first_seen, p.last_seen, p.dismissed_at, COALESCE(j.status, '')`

const postingFrom = ` FROM postings p LEFT JOIN jobs j ON j.id = p.job_id `

func scanPosting(s rowScanner) (Posting, error) {
	var p Posting
	var lo, hi sql.NullInt64
	var sources string
	var jobID, searchID sql.NullString
	err := s.Scan(&p.ID, &p.DedupeKey, &p.URL, &p.Title, &p.Company, &p.Location, &p.WorkMode, &lo, &hi,
		&p.SalaryText, &p.Annualized, &p.Description, &p.DatePosted, &sources, &p.State, &jobID, &searchID,
		&p.FirstSeen, &p.LastSeen, &p.DismissedAt, &p.JobStatus)
	if lo.Valid {
		p.SalaryMin = &lo.Int64
	}
	if hi.Valid {
		p.SalaryMax = &hi.Int64
	}
	p.Sources = splitSources(sources)
	p.JobID, p.SearchID = jobID.String, searchID.String
	return p, err
}

func splitSources(s string) []string {
	out := []string{}
	for _, part := range strings.Split(s, ",") {
		if part = strings.TrimSpace(part); part != "" {
			out = append(out, part)
		}
	}
	return out
}

func (p Posting) asResult() discover.DiscoverResult {
	return discover.DiscoverResult{
		Key: p.DedupeKey, Title: p.Title, Company: p.Company, Location: p.Location, WorkMode: p.WorkMode,
		SalaryMin: p.SalaryMin, SalaryMax: p.SalaryMax, SalaryText: p.SalaryText, Annualized: p.Annualized,
		Description: p.Description, DatePosted: p.DatePosted, URL: p.URL, Sources: p.Sources,
	}
}

func findPosting(q querier, key, url string) (Posting, error) {
	return scanPosting(q.QueryRow(`SELECT `+postingColumns+postingFrom+
		`WHERE p.dedupe_key = ? OR (? != '' AND p.url = ?) ORDER BY p.dedupe_key = ? DESC LIMIT 1`, key, url, url, key))
}

// UpsertPostings stores scraped results. Known postings are merged (sources,
// missing fields, longer description) but keep their state, so dismissed stays
// dismissed. Postings matching a pipeline job are filed as saved. Returns how
// many landed in the inbox as new.
func (r *Repo) UpsertPostings(results []discover.DiscoverResult, searchID string) (int, error) {
	jobs, err := r.ListJobs()
	if err != nil {
		return 0, err
	}
	tracked := slices.Clone(results) // markTracked edits in place; leave the caller's slice alone
	markTracked(tracked, jobs)

	now := ts(r.now())
	tx, err := r.db.Begin()
	if err != nil {
		return 0, err
	}
	defer tx.Rollback()
	newCount := 0
	for _, res := range tracked {
		existing, err := findPosting(tx, res.Key, res.URL)
		switch {
		case err == nil:
			m := discover.MergeInto(existing.asResult(), res)
			_, err = tx.Exec(`UPDATE postings SET url = ?, location = ?, work_mode = ?, salary_min = ?, salary_max = ?,
				salary_text = ?, annualized = ?, description = ?, date_posted = ?, sources = ?, last_seen = ? WHERE id = ?`,
				m.URL, m.Location, m.WorkMode, nullInt(m.SalaryMin), nullInt(m.SalaryMax), m.SalaryText, m.Annualized,
				m.Description, m.DatePosted, strings.Join(m.Sources, ","), now, existing.ID)
		case errors.Is(err, sql.ErrNoRows):
			state := PostingNew
			if res.TrackedJobID != "" {
				state = PostingSaved
			} else {
				newCount++
			}
			_, err = tx.Exec(`INSERT INTO postings (id, dedupe_key, url, title, company, location, work_mode, salary_min,
				salary_max, salary_text, annualized, description, date_posted, sources, state, job_id, search_id,
				first_seen, last_seen) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
				newID(), res.Key, res.URL, res.Title, res.Company, res.Location, res.WorkMode, nullInt(res.SalaryMin),
				nullInt(res.SalaryMax), res.SalaryText, res.Annualized, res.Description, res.DatePosted,
				strings.Join(res.Sources, ","), state, nullStr(res.TrackedJobID), nullStr(searchID), now, now)
		}
		if err != nil {
			return 0, err
		}
	}
	return newCount, tx.Commit()
}

func (r *Repo) ListPostings(f PostingFilter) ([]Posting, error) {
	where := []string{}
	args := []any{}
	order := "p.first_seen DESC, p.rowid DESC"
	switch f.Tab {
	case "", "inbox":
		if f.OnlyNew {
			where, args = append(where, "p.state = ?"), append(args, PostingNew)
		} else {
			where, args = append(where, "p.state IN (?, ?)"), append(args, PostingNew, PostingSeen)
		}
	case "saved":
		where, args = append(where, "p.state = ?"), append(args, PostingSaved)
	case "dismissed":
		where, args = append(where, "p.state = ?"), append(args, PostingDismissed)
		order = "p.dismissed_at DESC, p.rowid DESC"
	default:
		return nil, fmt.Errorf("unknown tab %q", f.Tab)
	}
	if q := strings.ToLower(strings.TrimSpace(f.Query)); q != "" {
		where = append(where, "(LOWER(p.title) LIKE ? OR LOWER(p.company) LIKE ? OR LOWER(p.location) LIKE ?)")
		like := "%" + q + "%"
		args = append(args, like, like, like)
	}
	if f.Source != "" {
		where = append(where, "(',' || p.sources || ',') LIKE ?")
		args = append(args, "%,"+f.Source+",%")
	}
	return queryAll(r.db, scanPosting, `SELECT `+postingColumns+postingFrom+`WHERE `+strings.Join(where, " AND ")+` ORDER BY `+order, args...)
}

func (r *Repo) GetPosting(id string) (Posting, error) {
	p, err := scanPosting(r.db.QueryRow(`SELECT `+postingColumns+postingFrom+`WHERE p.id = ?`, id))
	if errors.Is(err, sql.ErrNoRows) {
		return p, fmt.Errorf("posting %s: %w", id, ErrNotFound)
	}
	return p, err
}

func (r *Repo) InboxCounts() (InboxCounts, error) {
	var c InboxCounts
	perState, err := queryAll(r.db, scanKeyValue[int], `SELECT state, COUNT(*) FROM postings GROUP BY state`)
	if err != nil {
		return c, err
	}
	for _, kv := range perState {
		state, n := kv.key, kv.value
		switch state {
		case PostingNew:
			c.New, c.Inbox = n, c.Inbox+n
		case PostingSeen:
			c.Inbox += n
		case PostingSaved:
			c.Saved = n
		case PostingDismissed:
			c.Dismissed = n
		}
	}
	return c, nil
}

func (r *Repo) MarkPostingSeen(id string) error {
	res, err := r.db.Exec(`UPDATE postings SET state = CASE WHEN state = ? THEN ? ELSE state END WHERE id = ?`, PostingNew, PostingSeen, id)
	return expectOneRow(res, err, "posting", id)
}

func (r *Repo) DismissPosting(id string) error {
	res, err := r.db.Exec(`UPDATE postings SET state = ?, dismissed_at = ? WHERE id = ?`, PostingDismissed, ts(r.now()), id)
	return expectOneRow(res, err, "posting", id)
}

// RestorePosting moves a dismissed posting back to the inbox.
func (r *Repo) RestorePosting(id string) error {
	res, err := r.db.Exec(`UPDATE postings SET state = ?, dismissed_at = '' WHERE id = ? AND state = ?`, PostingSeen, id, PostingDismissed)
	return expectOneRow(res, err, "dismissed posting", id)
}

// SavePosting adds the posting to the Interested column (or returns the job it already created).
func (r *Repo) SavePosting(id string) (Job, error) {
	p, err := r.GetPosting(id)
	if err != nil {
		return Job{}, err
	}
	if p.State == PostingSaved && p.JobID != "" {
		if j, err := r.GetJob(p.JobID); err == nil {
			return j, nil
		}
	}
	company := strings.TrimSpace(p.Company)
	if company == "" {
		company = "Unknown company"
	}
	source := SourceManual
	if len(p.Sources) > 0 {
		source = p.Sources[0]
	}
	// One transaction, so a failed posting update can't leave an orphaned job.
	tx, err := r.db.Begin()
	if err != nil {
		return Job{}, err
	}
	defer tx.Rollback()
	j, err := r.insertJob(tx, Job{
		Company: company, Position: p.Title, Status: StatusInterested, Location: p.Location, WorkMode: p.WorkMode,
		SalaryMin: p.SalaryMin, SalaryMax: p.SalaryMax, SalaryText: p.SalaryText, URL: p.URL, Source: source,
		Description: p.Description, DatePosted: p.DatePosted,
	})
	if err != nil {
		return Job{}, err
	}
	if _, err := tx.Exec(`UPDATE postings SET state = ?, job_id = ?, dismissed_at = '' WHERE id = ?`, PostingSaved, j.ID, id); err != nil {
		return Job{}, err
	}
	return j, tx.Commit()
}

// ClearDismissed deletes dismissed postings older than the given number of days.
func (r *Repo) ClearDismissed(olderThanDays int) (int, error) {
	cutoff := ts(r.now().Add(-time.Duration(olderThanDays) * 24 * time.Hour))
	res, err := r.db.Exec(`DELETE FROM postings WHERE state = ? AND dismissed_at < ?`, PostingDismissed, cutoff)
	if err != nil {
		return 0, err
	}
	n, err := res.RowsAffected()
	return int(n), err
}

// markTracked flags results that are already on the board, by company+title or URL.
func markTracked(results []discover.DiscoverResult, jobs []Job) {
	byKey := map[string]Job{}
	byURL := map[string]Job{}
	for _, j := range jobs {
		byKey[discover.DedupeKey(j.Company, j.Position)] = j
		if j.URL != "" {
			byURL[j.URL] = j
		}
	}
	for i := range results {
		j, ok := byKey[results[i].Key]
		if !ok && results[i].URL != "" {
			j, ok = byURL[results[i].URL]
		}
		if ok {
			results[i].TrackedJobID, results[i].TrackedStatus = j.ID, j.Status
		}
	}
}
