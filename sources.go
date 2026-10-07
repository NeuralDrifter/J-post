package main

import (
	"context"
	"errors"
	"fmt"
	"time"
)

// Every job board Discover can search, in display order. Adding a board means
// adding one entry here; the Discover page reads this list via ListJobSources.

const (
	sourceOfficial = "official" // a public API
	sourceScraped  = "scraped"  // scraped via JobSpy
)

type jobSource struct {
	id         string
	label      string
	kind       string
	maxResults int    // per-search cap imposed by the board; 0 = only maxPerSource
	note       string // shown next to the checkbox
	defaultOn  bool   // ticked on a first visit
	// minInterval allows at most one call per interval across all searches; 0 = no limit.
	minInterval time.Duration
	// unavailable explains what's missing before the board can be searched; "" when ready.
	unavailable func(Settings) string
	fetch       func(ctx context.Context, f sourceFetcher, q DiscoverQuery, opts fetchOptions) ([]rawJob, error)
}

var jobSources = []jobSource{
	{
		id: "adzuna", label: "Adzuna", kind: sourceOfficial, maxResults: maxAdzunaResults,
		unavailable: func(s Settings) string {
			return missingUnless(s.AdzunaAppID != "" && s.AdzunaAppKey != "", "Add your Adzuna keys in Settings")
		},
		fetch: func(ctx context.Context, f sourceFetcher, q DiscoverQuery, opts fetchOptions) ([]rawJob, error) {
			return adzunaSearch(ctx, f.settings.AdzunaAppID, f.settings.AdzunaAppKey, q, opts)
		},
	},
	{
		id: "usajobs", label: "USAJobs", kind: sourceOfficial, defaultOn: true,
		unavailable: func(s Settings) string {
			return missingUnless(s.USAJobsKey != "" && s.USAJobsEmail != "", "Add your USAJobs key and email in Settings")
		},
		fetch: func(ctx context.Context, f sourceFetcher, q DiscoverQuery, opts fetchOptions) ([]rawJob, error) {
			return usajobsSearch(ctx, f.settings.USAJobsKey, f.settings.USAJobsEmail, q, opts)
		},
	},
	{
		id: "himalayas", label: "Himalayas", kind: sourceOfficial, note: "remote only", defaultOn: true,
		fetch: func(ctx context.Context, _ sourceFetcher, q DiscoverQuery, opts fetchOptions) ([]rawJob, error) {
			return himalayasSearch(ctx, q, opts)
		},
	},
	{
		id: "jobicy", label: "Jobicy", kind: sourceOfficial, note: "remote only, 1 call/hour", defaultOn: true,
		minInterval: time.Hour, // Jobicy asks for at most one call per hour
		fetch: func(ctx context.Context, _ sourceFetcher, q DiscoverQuery, opts fetchOptions) ([]rawJob, error) {
			return jobicySearch(ctx, q, opts)
		},
	},
	{
		id: "themuse", label: "The Muse", kind: sourceOfficial, defaultOn: true,
		unavailable: func(s Settings) string {
			return missingUnless(len(s.MuseCategories) > 0, "Pick The Muse categories in Settings")
		},
		fetch: func(ctx context.Context, f sourceFetcher, q DiscoverQuery, opts fetchOptions) ([]rawJob, error) {
			return f.repo.museSearch(ctx, q, opts, f.settings.MuseCategories)
		},
	},
	jobSpySource("indeed", "Indeed"),
	jobSpySource("linkedin", "LinkedIn"),
	jobSpySource("zip_recruiter", "ZipRecruiter"),
}

func jobSpySource(id, label string) jobSource {
	return jobSource{
		id: id, label: label, kind: sourceScraped, defaultOn: true,
		fetch: func(ctx context.Context, f sourceFetcher, q DiscoverQuery, opts fetchOptions) ([]rawJob, error) {
			python, err := findPython(f.settings.PythonPath)
			if err != nil {
				return nil, err
			}
			return runJobSpy(ctx, python, id, q, opts)
		},
	}
}

func missingUnless(ready bool, reason string) string {
	if ready {
		return ""
	}
	return reason
}

func findSource(id string) (jobSource, bool) {
	for _, s := range jobSources {
		if s.id == id {
			return s, true
		}
	}
	return jobSource{}, false
}

func isKnownSource(id string) bool {
	_, ok := findSource(id)
	return ok
}

func (s jobSource) unavailableReason(settings Settings) string {
	if s.unavailable == nil {
		return ""
	}
	return s.unavailable(settings)
}

// JobSource is a board as the Discover page sees it.
type JobSource struct {
	ID          string `json:"id"`
	Label       string `json:"label"`
	Kind        string `json:"kind"` // official | scraped
	MaxResults  int    `json:"maxResults"`
	Note        string `json:"note"`
	DefaultOn   bool   `json:"defaultOn"`
	Unavailable string `json:"unavailable"` // why it can't be searched yet; "" when ready
}

func ListJobSources(settings Settings) []JobSource {
	out := make([]JobSource, 0, len(jobSources))
	for _, s := range jobSources {
		out = append(out, JobSource{
			ID: s.id, Label: s.label, Kind: s.kind, MaxResults: s.resultCap(), Note: s.note,
			DefaultOn: s.defaultOn, Unavailable: s.unavailableReason(settings),
		})
	}
	return out
}

// resultCap is the most results one search may request from this board.
func (s jobSource) resultCap() int {
	if s.maxResults > 0 {
		return min(s.maxResults, maxPerSource)
	}
	return maxPerSource
}

// sourceFetcher runs one board's search with what the boards may need: the
// user's keys, the repo (local Muse copy, rate-limit log).
type sourceFetcher struct {
	settings Settings
	repo     *Repo
}

// fetch matches sourceFunc, so it can be handed to RunSearch.
func (f sourceFetcher) fetch(ctx context.Context, id string, q DiscoverQuery, opts fetchOptions) ([]rawJob, error) {
	src, ok := findSource(id)
	if !ok {
		return nil, fmt.Errorf("unknown job board %q", id)
	}
	if reason := src.unavailableReason(f.settings); reason != "" {
		return nil, errors.New(reason)
	}
	if err := f.takeRateLimitSlot(src); err != nil {
		return nil, err
	}
	return src.fetch(ctx, f, q, opts)
}

func (f sourceFetcher) takeRateLimitSlot(src jobSource) error {
	if src.minInterval == 0 {
		return nil
	}
	next, ok, err := f.repo.takeSourceSlot(src.id, src.minInterval)
	if err != nil {
		return err
	}
	if !ok {
		return fmt.Errorf("skipped: %s is rate-limited; next search after %s", src.label, next.Format("3:04 PM"))
	}
	return nil
}
