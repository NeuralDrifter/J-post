package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"slices"
	"sort"
	"strings"
	"time"
)

const (
	defaultPerSource = 20
	minPerSource     = 5
	maxPerSource     = 100
	maxAdzunaResults = 50  // Adzuna's results_per_page limit
	maxHoursOld      = 720 // never look back more than 30 days
)

// SearchQuery is what the Discover form submits.
type SearchQuery struct {
	Term       string         `json:"term"`
	Location   string         `json:"location"`
	RemoteOnly bool           `json:"remoteOnly"`
	Sources    []string       `json:"sources"`
	PerSource  map[string]int `json:"perSource"` // results to request from each board
}

type SavedSearch struct {
	ID         string         `json:"id"`
	Term       string         `json:"term"`
	Location   string         `json:"location"`
	RemoteOnly bool           `json:"remoteOnly"`
	Sources    []string       `json:"sources"`
	PerSource  map[string]int `json:"perSource"`
	LastRunAt  string         `json:"lastRunAt"`
	CreatedAt  string         `json:"createdAt"`
}

// SearchRun reports what a search did: served from cache, or scraped and stored.
type SearchRun struct {
	SearchID  string            `json:"searchId"`
	Cached    bool              `json:"cached"`
	Fetched   int               `json:"fetched"`
	NewCount  int               `json:"newCount"`
	Errors    map[string]string `json:"errors"`
	LastRunAt string            `json:"lastRunAt"`
}

// fetchOptions are the per-source limits passed to a scraper or API.
type fetchOptions struct {
	Results  int
	HoursOld int // 0 = no age limit
}

// maxDaysOld is HoursOld in whole days, rounded up, for APIs that filter by day.
func (o fetchOptions) maxDaysOld() int { return (o.HoursOld + 23) / 24 }

func normalizeSources(sources []string) []string {
	out := []string{}
	for _, s := range sources {
		if isKnownSource(s) && !slices.Contains(out, s) {
			out = append(out, s)
		}
	}
	sort.Strings(out)
	return out
}

func searchKey(q SearchQuery) string {
	remote := "0"
	if q.RemoteOnly {
		remote = "1"
	}
	return normalizeForMatch(q.Term) + "|" + normalizeForMatch(q.Location) + "|" + remote + "|" + strings.Join(normalizeSources(q.Sources), ",")
}

// perSourceCount is the clamped number of results to request from one board.
func perSourceCount(q SearchQuery, source string) int {
	n, ok := q.PerSource[source]
	if !ok || n <= 0 {
		n = defaultPerSource
	}
	src, _ := findSource(source)
	return max(minPerSource, min(n, src.resultCap()))
}

// hoursOld asks scrapers only for postings newer than the previous run (plus a day
// of slack for late-dated listings). The first run has no limit.
func hoursOld(lastRunAt string, now time.Time) int {
	if lastRunAt == "" {
		return 0
	}
	last, err := time.Parse(time.RFC3339, lastRunAt)
	if err != nil {
		return 0
	}
	h := int(math.Ceil(now.Sub(last).Hours())) + 24
	return max(24, min(h, maxHoursOld))
}

// cacheHit reports whether the search ran recently enough to reuse its results.
func cacheHit(s SavedSearch, now time.Time, cacheHours int) bool {
	if cacheHours <= 0 || s.LastRunAt == "" {
		return false
	}
	last, err := time.Parse(time.RFC3339, s.LastRunAt)
	if err != nil {
		return false
	}
	return now.Sub(last) < time.Duration(cacheHours)*time.Hour
}

const searchColumns = `id, term, location, remote_only, sources, per_source, last_run_at, created_at`

func scanSearch(s rowScanner) (SavedSearch, error) {
	var out SavedSearch
	var sources, perSource string
	if err := s.Scan(&out.ID, &out.Term, &out.Location, &out.RemoteOnly, &sources, &perSource, &out.LastRunAt, &out.CreatedAt); err != nil {
		return out, err
	}
	out.Sources = splitSources(sources)
	out.PerSource = map[string]int{}
	if err := json.Unmarshal([]byte(perSource), &out.PerSource); err != nil {
		return out, fmt.Errorf("search %s: unreadable per-board counts: %w", out.ID, err)
	}
	return out, nil
}

// UpsertSearch finds the saved search for this query (same term, location, remote
// flag and sources) or creates it, storing the latest per-board counts.
func (r *Repo) UpsertSearch(q SearchQuery) (SavedSearch, error) {
	key := searchKey(q)
	perSource := q.PerSource
	if perSource == nil {
		perSource = map[string]int{}
	}
	per, err := json.Marshal(perSource)
	if err != nil {
		return SavedSearch{}, err
	}
	var id string
	err = r.db.QueryRow(`SELECT id FROM searches WHERE query_key = ?`, key).Scan(&id)
	switch {
	case errors.Is(err, sql.ErrNoRows):
		id = newID()
		_, err = r.db.Exec(`INSERT INTO searches (id, query_key, term, location, remote_only, sources, per_source, created_at)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, id, key, strings.TrimSpace(q.Term), strings.TrimSpace(q.Location), q.RemoteOnly,
			strings.Join(normalizeSources(q.Sources), ","), string(per), ts(r.now()))
	case err == nil:
		_, err = r.db.Exec(`UPDATE searches SET per_source = ? WHERE id = ?`, string(per), id)
	}
	if err != nil {
		return SavedSearch{}, err
	}
	return scanSearch(r.db.QueryRow(`SELECT `+searchColumns+` FROM searches WHERE id = ?`, id))
}

func (r *Repo) markSearchRun(id string, at time.Time) error {
	res, err := r.db.Exec(`UPDATE searches SET last_run_at = ? WHERE id = ?`, ts(at), id)
	return expectOneRow(res, err, "search", id)
}

func (r *Repo) ListRecentSearches(limit int) ([]SavedSearch, error) {
	rows, err := r.db.Query(`SELECT `+searchColumns+` FROM searches ORDER BY last_run_at DESC, created_at DESC LIMIT ?`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []SavedSearch{}
	for rows.Next() {
		s, err := scanSearch(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, s)
	}
	return out, rows.Err()
}

func (r *Repo) DeleteSearch(id string) error {
	res, err := r.db.Exec(`DELETE FROM searches WHERE id = ?`, id)
	return expectOneRow(res, err, "search", id)
}

// RunSearch serves a search that ran within the cache window from the inbox;
// otherwise it fetches like RefreshSearch.
func RunSearch(ctx context.Context, r *Repo, q SearchQuery, s Settings, fetch sourceFunc) (SearchRun, error) {
	return runSearch(ctx, r, q, s.DiscoverCacheHours, fetch)
}

// RefreshSearch asks each board for postings newer than the last run, even if
// the search ran recently, and stores what it finds.
func RefreshSearch(ctx context.Context, r *Repo, q SearchQuery, fetch sourceFunc) (SearchRun, error) {
	return runSearch(ctx, r, q, 0, fetch)
}

// runSearch reuses results younger than cacheHours (0 = always fetch).
func runSearch(ctx context.Context, r *Repo, q SearchQuery, cacheHours int, fetch sourceFunc) (SearchRun, error) {
	q.Term, q.Location = strings.TrimSpace(q.Term), strings.TrimSpace(q.Location)
	if q.Term == "" {
		return SearchRun{}, errors.New("enter a job title or keywords to search")
	}
	q.Sources = normalizeSources(q.Sources)
	if len(q.Sources) == 0 {
		return SearchRun{}, errors.New("pick at least one job board")
	}
	saved, err := r.UpsertSearch(q)
	if err != nil {
		return SearchRun{}, err
	}
	now := r.now()
	run := SearchRun{SearchID: saved.ID, Errors: map[string]string{}, LastRunAt: saved.LastRunAt}
	if cacheHit(saved, now, cacheHours) {
		run.Cached = true
		return run, nil
	}

	age := hoursOld(saved.LastRunAt, now)
	dq := DiscoverQuery{Term: q.Term, Location: q.Location, RemoteOnly: q.RemoteOnly, Sources: q.Sources}
	resp := runDiscover(ctx, dq, fetch, nil, func(source string) fetchOptions {
		return fetchOptions{Results: perSourceCount(q, source), HoursOld: age}
	})
	run.Errors, run.Fetched = resp.Errors, len(resp.Results)
	if run.NewCount, err = r.UpsertPostings(resp.Results, saved.ID); err != nil {
		return run, err
	}
	// Only count it as a run if at least one board answered; otherwise retry next time.
	if len(resp.Errors) < len(q.Sources) {
		if err := r.markSearchRun(saved.ID, now); err != nil {
			return run, err
		}
		run.LastRunAt = ts(now)
	}
	return run, nil
}
