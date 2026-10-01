package main

import (
	"context"
	"errors"
	"sync"
	"testing"
	"time"
)

func TestHoursOld(t *testing.T) {
	now := time.Date(2026, 10, 1, 12, 0, 0, 0, time.UTC)
	cases := map[string]int{
		"":                                0,      // first run: no age limit
		ts(now.Add(-2 * time.Hour)):       2 + 24, // a little extra so late-dated postings aren't missed
		ts(now.Add(-90 * time.Minute)):    2 + 24, // rounds up
		ts(now.Add(-60 * 24 * time.Hour)): 720,    // capped at 30 days
		"garbage":                         0,
	}
	for last, want := range cases {
		if got := hoursOld(last, now); got != want {
			t.Errorf("hoursOld(%q) = %d, want %d", last, got, want)
		}
	}
}

func TestPerSourceClamp(t *testing.T) {
	q := SearchQuery{PerSource: map[string]int{"indeed": 500, "linkedin": 1, "adzuna": 80}}
	if got := perSourceCount(q, "indeed"); got != 100 {
		t.Errorf("indeed = %d", got)
	}
	if got := perSourceCount(q, "linkedin"); got != 5 {
		t.Errorf("linkedin = %d", got)
	}
	if got := perSourceCount(q, "adzuna"); got != 50 {
		t.Errorf("adzuna (API max 50) = %d", got)
	}
	if got := perSourceCount(q, "zip_recruiter"); got != 20 {
		t.Errorf("default = %d", got)
	}
}

func TestSearchCacheRules(t *testing.T) {
	r := newTestRepo(t)
	q := SearchQuery{Term: " Go Developer ", Location: "Denver", Sources: []string{"linkedin", "indeed"}, PerSource: map[string]int{"indeed": 30}}
	s, err := r.UpsertSearch(q)
	if err != nil {
		t.Fatal(err)
	}
	same, _ := r.UpsertSearch(SearchQuery{Term: "go developer", Location: "denver", Sources: []string{"indeed", "linkedin"}, PerSource: map[string]int{"indeed": 40}})
	if same.ID != s.ID || same.PerSource["indeed"] != 40 {
		t.Fatalf("same query should reuse the row and keep the latest counts: %+v vs %+v", same, s)
	}
	other, _ := r.UpsertSearch(SearchQuery{Term: "go developer", Location: "denver", Sources: []string{"indeed"}})
	if other.ID == s.ID {
		t.Fatal("a different source set is a different search")
	}

	now := r.now()
	if cacheHit(same, now, 12) {
		t.Fatal("a search that never ran can't be cached")
	}
	if err := r.markSearchRun(same.ID, now.Add(-3*time.Hour)); err != nil {
		t.Fatal(err)
	}
	ran, _ := r.UpsertSearch(q)
	if !cacheHit(ran, now, 12) || cacheHit(ran, now, 2) || cacheHit(ran, now, 0) {
		t.Fatalf("cache window wrong for %+v", ran)
	}
	recent, err := r.ListRecentSearches(10)
	if err != nil || len(recent) != 2 || recent[0].ID != ran.ID {
		t.Fatalf("recent = %+v %v", recent, err)
	}
	if err := r.DeleteSearch(other.ID); err != nil {
		t.Fatal(err)
	}
}

type fakeFetch struct {
	mu    sync.Mutex
	calls map[string]fetchOptions
}

func (f *fakeFetch) fn(ctx context.Context, source string, q DiscoverQuery, opts fetchOptions) ([]rawJob, error) {
	f.mu.Lock()
	f.calls[source] = opts
	f.mu.Unlock()
	if source == "linkedin" {
		return nil, errors.New("blocked")
	}
	return []rawJob{{Title: "Go Dev", Company: "Acme"}, {Title: "Rust Dev", Company: "Brex"}}, nil
}

func TestRunSearchFakeFetcher(t *testing.T) {
	r := newTestRepo(t)
	settings := Settings{DiscoverCacheHours: 12}
	q := SearchQuery{Term: "dev", Sources: []string{"indeed", "linkedin"}, PerSource: map[string]int{"indeed": 30}}

	f := &fakeFetch{calls: map[string]fetchOptions{}}
	run, err := RunSearch(context.Background(), r, q, false, settings, f.fn)
	if err != nil {
		t.Fatal(err)
	}
	if run.Cached || run.Fetched != 2 || run.NewCount != 2 || run.Errors["linkedin"] != "blocked" {
		t.Fatalf("first run = %+v", run)
	}
	if f.calls["indeed"] != (fetchOptions{Results: 30, HoursOld: 0}) || f.calls["linkedin"].Results != 20 {
		t.Fatalf("options = %+v", f.calls)
	}

	f2 := &fakeFetch{calls: map[string]fetchOptions{}}
	again, _ := RunSearch(context.Background(), r, q, false, settings, f2.fn)
	if !again.Cached || len(f2.calls) != 0 {
		t.Fatalf("second run within the window should be cached: %+v calls=%v", again, f2.calls)
	}

	setNow(r, 2026, time.October, 1, 15) // 3 hours later
	forced, _ := RunSearch(context.Background(), r, q, true, settings, f2.fn)
	if forced.Cached || forced.NewCount != 0 || f2.calls["indeed"].HoursOld != 3+24 {
		t.Fatalf("forced = %+v calls=%v", forced, f2.calls)
	}

	if _, err := RunSearch(context.Background(), r, SearchQuery{Term: "  "}, false, settings, f2.fn); err == nil {
		t.Fatal("empty term should error")
	}
}
