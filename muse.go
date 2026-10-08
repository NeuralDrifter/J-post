// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

package main

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"net/url"
	"strconv"
	"strings"
	"time"

	"jobtrack/internal/textproc"
)

// The Muse API has no keyword search, so Job Track keeps a local copy of the
// slices the user cares about (category × location), refreshed at most daily,
// and searches that copy.
var (
	museBaseURL   = "https://www.themuse.com/api/public/jobs"
	musePageDelay = 300 * time.Millisecond
)

const (
	museMaxPages     = 100 // 2,000 jobs per slice
	museSliceTTL     = 24 * time.Hour
	museRemote       = "Flexible / Remote"
	museMinRemaining = 10 // stop paging when the hourly allowance runs this low
)

type museResponse struct {
	PageCount int `json:"page_count"`
	Total     int `json:"total"`
	Results   []struct {
		ID              int64  `json:"id"`
		Name            string `json:"name"`
		Contents        string `json:"contents"`
		PublicationDate string `json:"publication_date"`
		Company         struct {
			Name string `json:"name"`
		} `json:"company"`
		Locations []struct {
			Name string `json:"name"`
		} `json:"locations"`
		Levels []struct {
			Name string `json:"name"`
		} `json:"levels"`
		Refs struct {
			LandingPage string `json:"landing_page"`
		} `json:"refs"`
	} `json:"results"`
}

// museLocation maps the search location to The Muse's "City, ST" names.
func museLocation(q DiscoverQuery) string {
	loc := strings.TrimSpace(q.Location)
	if q.RemoteOnly || loc == "" {
		return museRemote
	}
	parts := strings.SplitN(loc, ",", 2)
	city := strings.Fields(strings.ToLower(parts[0]))
	for i, w := range city {
		city[i] = strings.ToUpper(w[:1]) + w[1:]
	}
	out := strings.Join(city, " ")
	if len(parts) == 2 {
		out += ", " + strings.ToUpper(strings.TrimSpace(parts[1]))
	}
	return out
}

func museSliceKey(category, location string) string { return category + "|" + location }

func fetchMusePage(ctx context.Context, category, location string, page int) (museResponse, int, error) {
	var out museResponse
	params := url.Values{"page": {strconv.Itoa(page)}, "category": {category}, "location": {location}}
	header, err := getJSON(ctx, apiRequest{source: "The Muse", url: museBaseURL + "?" + params.Encode()}, &out)
	if err != nil {
		return out, 0, err
	}
	remaining := -1
	if v, err := strconv.Atoi(header.Get("X-RateLimit-Remaining")); err == nil {
		remaining = v
	}
	return out, remaining, nil
}

// museJob is one listing in the local copy of a slice.
type museJob struct {
	id                                                        int64
	title, company, locations, levels, date, url, description string
}

// syncMuseSlice refreshes one category × location copy if it's older than a day.
// It returns the slice's job count.
func (r *Repo) syncMuseSlice(ctx context.Context, category, location string) (int, error) {
	key := museSliceKey(category, location)
	total, fresh, err := r.freshMuseSlice(key)
	if err != nil || fresh {
		return total, err
	}
	jobs, err := fetchMuseSlice(ctx, category, location)
	if err != nil {
		return 0, err
	}
	if err := r.replaceMuseSlice(key, category, location, jobs); err != nil {
		return 0, err
	}
	return len(jobs), nil
}

// freshMuseSlice reports whether the stored slice was synced within museSliceTTL, and its size.
func (r *Repo) freshMuseSlice(key string) (total int, fresh bool, err error) {
	var syncedAt string
	err = r.db.QueryRow(`SELECT synced_at, total FROM muse_slices WHERE slice_key = ?`, key).Scan(&syncedAt, &total)
	if errors.Is(err, sql.ErrNoRows) {
		return 0, false, nil
	}
	if err != nil {
		return 0, false, err
	}
	t, err := time.Parse(time.RFC3339, syncedAt)
	return total, err == nil && r.now().Sub(t) < museSliceTTL, nil
}

// fetchMuseSlice pages through The Muse for one slice, pausing between pages and
// stopping early when the hourly allowance runs low. A failure after the first
// page keeps the pages already fetched.
func fetchMuseSlice(ctx context.Context, category, location string) ([]museJob, error) {
	var jobs []museJob
	for page := 0; page < museMaxPages; page++ {
		if page > 0 && musePageDelay > 0 {
			select {
			case <-ctx.Done():
				return nil, ctx.Err()
			case <-time.After(musePageDelay):
			}
		}
		resp, remaining, err := fetchMusePage(ctx, category, location, page)
		if err != nil {
			if len(jobs) > 0 {
				break
			}
			return nil, err
		}
		jobs = append(jobs, museJobs(resp)...)
		if page+1 >= resp.PageCount || (remaining >= 0 && remaining < museMinRemaining) {
			break
		}
	}
	return jobs, nil
}

func museJobs(resp museResponse) []museJob {
	jobs := make([]museJob, 0, len(resp.Results))
	for _, j := range resp.Results {
		var locs, levels []string
		for _, l := range j.Locations {
			locs = append(locs, l.Name)
		}
		for _, l := range j.Levels {
			levels = append(levels, l.Name)
		}
		jobs = append(jobs, museJob{j.ID, j.Name, j.Company.Name, strings.Join(locs, "; "), strings.Join(levels, ", "),
			textproc.DatePart(j.PublicationDate), j.Refs.LandingPage, textproc.HTMLToText(j.Contents)})
	}
	return jobs
}

// replaceMuseSlice swaps the stored copy of a slice for jobs and stamps the sync time.
func (r *Repo) replaceMuseSlice(key, category, location string, jobs []museJob) error {
	tx, err := r.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if _, err := tx.Exec(`DELETE FROM muse_jobs WHERE slice_key = ?`, key); err != nil {
		return err
	}
	for _, j := range jobs {
		if _, err := tx.Exec(`INSERT OR REPLACE INTO muse_jobs (muse_id, slice_key, title, company, locations, levels, publication_date, url, description)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, j.id, key, j.title, j.company, j.locations, j.levels, j.date, j.url, j.description); err != nil {
			return err
		}
	}
	if _, err := tx.Exec(`INSERT INTO muse_slices (slice_key, category, location, synced_at, total) VALUES (?, ?, ?, ?, ?)
		ON CONFLICT(slice_key) DO UPDATE SET synced_at = excluded.synced_at, total = excluded.total`,
		key, category, location, ts(r.now()), len(jobs)); err != nil {
		return err
	}
	return tx.Commit()
}

// museSearch syncs the needed slices, then keyword-searches the local copy:
// every word must appear in the title, company or description.
func (r *Repo) museSearch(ctx context.Context, q DiscoverQuery, opts fetchOptions, categories []string) ([]rawJob, error) {
	location := museLocation(q)
	keys := []string{}
	found := 0
	for _, c := range categories {
		n, err := r.syncMuseSlice(ctx, c, location)
		if err != nil {
			return nil, err
		}
		found += n
		keys = append(keys, museSliceKey(c, location))
	}
	if found == 0 {
		return nil, fmt.Errorf("The Muse has no %q listings for these categories (try \"City, ST\", e.g. \"Denver, CO\")", location)
	}

	where := []string{"slice_key IN (" + strings.TrimSuffix(strings.Repeat("?,", len(keys)), ",") + ")"}
	args := []any{}
	for _, k := range keys {
		args = append(args, k)
	}
	for _, w := range strings.Fields(strings.ToLower(q.Term)) {
		where = append(where, "(LOWER(title) LIKE ? OR LOWER(company) LIKE ? OR LOWER(description) LIKE ?)")
		like := "%" + w + "%"
		args = append(args, like, like, like)
	}
	if opts.HoursOld > 0 {
		where = append(where, "publication_date >= ?")
		args = append(args, r.now().Add(-time.Duration(opts.HoursOld)*time.Hour).Format(textproc.DateLayout))
	}
	limit := max(opts.Results, 1)
	return queryAll(r.db, scanMuseJob, `SELECT title, company, locations, publication_date, url, MAX(description) FROM muse_jobs
		WHERE `+strings.Join(where, " AND ")+` GROUP BY muse_id ORDER BY publication_date DESC, muse_id DESC LIMIT ?`, append(args, limit)...)
}

func scanMuseJob(s rowScanner) (rawJob, error) {
	j := rawJob{Site: "themuse"}
	err := s.Scan(&j.Title, &j.Company, &j.Location, &j.DatePosted, &j.URL, &j.Description)
	j.IsRemote = strings.Contains(j.Location, museRemote)
	return j, err
}

// takeSourceSlot enforces "at most one call per interval" for rate-limited
// sources. It records the call when allowed, otherwise returns when it's next allowed.
func (r *Repo) takeSourceSlot(source string, every time.Duration) (time.Time, bool, error) {
	now := r.now()
	var last string
	err := r.db.QueryRow(`SELECT last_called_at FROM source_calls WHERE source = ?`, source).Scan(&last)
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		return time.Time{}, false, err
	}
	if err == nil {
		if t, perr := time.Parse(time.RFC3339, last); perr == nil && now.Sub(t) < every {
			return t.Add(every).In(now.Location()), false, nil
		}
	}
	_, err = r.db.Exec(`INSERT INTO source_calls (source, last_called_at) VALUES (?, ?)
		ON CONFLICT(source) DO UPDATE SET last_called_at = excluded.last_called_at`, source, ts(now))
	return now, err == nil, err
}
