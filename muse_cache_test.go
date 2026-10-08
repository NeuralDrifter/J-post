// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

package main

import (
	"context"
	"fmt"
	"net/http"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

// fakeMuse serves 45 jobs (3 pages of 20/20/5) for any slice and counts requests.
func fakeMuse(t *testing.T, total int) *int32 {
	var calls int32
	url := fakeServer(t, func(w http.ResponseWriter, r *http.Request) {
		atomic.AddInt32(&calls, 1)
		q := r.URL.Query()
		var page int
		fmt.Sscan(q.Get("page"), &page)
		pageCount := (total + 19) / 20
		var items []string
		for i := page * 20; i < min(total, (page+1)*20); i++ {
			title := "Accountant"
			if i%3 == 0 {
				title = "Senior Go Developer"
			}
			items = append(items, fmt.Sprintf(`{"id":%d,"name":"%s","company":{"name":"Co%d"},"locations":[{"name":"%s"}],
				"levels":[{"name":"Mid Level"}],"publication_date":"2026-09-%02dT10:00:00Z","refs":{"landing_page":"https://www.themuse.com/jobs/co/%d"},
				"contents":"<p>Work with <b>Go</b> and %s</p>"}`, i, title, i, q.Get("location"), 1+i%28, i, q.Get("category")))
		}
		w.Header().Set("X-RateLimit-Remaining", "400")
		fmt.Fprintf(w, `{"page":%d,"page_count":%d,"total":%d,"results":[%s]}`, page, pageCount, total, strings.Join(items, ","))
	})
	oldURL, oldDelay := museBaseURL, musePageDelay
	museBaseURL, musePageDelay = url, 0
	t.Cleanup(func() { museBaseURL, musePageDelay = oldURL, oldDelay })
	return &calls
}

func TestMuseSyncAndLocalSearch(t *testing.T) {
	r := newTestRepo(t)
	calls := fakeMuse(t, 45)
	q := DiscoverQuery{Term: "go developer", Location: "denver, co"}
	jobs, err := r.museSearch(context.Background(), q, fetchOptions{Results: 10}, []string{"Software Engineering"})
	if err != nil {
		t.Fatal(err)
	}
	if *calls != 3 {
		t.Fatalf("want 3 page requests, got %d", *calls)
	}
	// 15 of 45 jobs are "Senior Go Developer"; capped at 10, newest first.
	if len(jobs) != 10 || jobs[0].Site != "themuse" || jobs[0].Location != "Denver, CO" || !strings.HasPrefix(jobs[0].URL, "https://www.themuse.com/") {
		t.Fatalf("jobs = %+v", jobs)
	}
	for i := 1; i < len(jobs); i++ {
		if jobs[i].DatePosted > jobs[i-1].DatePosted {
			t.Fatal("results should be newest first")
		}
	}
	if !strings.Contains(jobs[0].Description, "Work with Go") {
		t.Fatalf("description = %q", jobs[0].Description)
	}

	// Within 24h the slice is reused: no new requests.
	if _, err := r.museSearch(context.Background(), DiscoverQuery{Term: "accountant", Location: "Denver, CO"}, fetchOptions{Results: 50}, []string{"Software Engineering"}); err != nil {
		t.Fatal(err)
	}
	if *calls != 3 {
		t.Fatalf("slice should be reused, calls = %d", *calls)
	}
	// A day later it syncs again.
	setNow(r, 2026, time.October, 2, 13)
	r.museSearch(context.Background(), q, fetchOptions{Results: 10}, []string{"Software Engineering"})
	if *calls != 6 {
		t.Fatalf("stale slice should re-sync, calls = %d", *calls)
	}
}

func TestMuseRemoteAndAllWordsMustMatch(t *testing.T) {
	r := newTestRepo(t)
	fakeMuse(t, 45)
	jobs, err := r.museSearch(context.Background(), DiscoverQuery{Term: "senior rust", RemoteOnly: true}, fetchOptions{Results: 50}, []string{"Software Engineering"})
	if err != nil || len(jobs) != 0 {
		t.Fatalf("every word must match: %d jobs, %v", len(jobs), err)
	}
	jobs, _ = r.museSearch(context.Background(), DiscoverQuery{Term: "senior go", RemoteOnly: true}, fetchOptions{Results: 50}, []string{"Software Engineering"})
	if len(jobs) != 15 || jobs[0].Location != "Flexible / Remote" {
		t.Fatalf("remote search = %d jobs, first %+v", len(jobs), jobs[0])
	}
}

func TestMuseEmptySlice(t *testing.T) {
	r := newTestRepo(t)
	fakeMuse(t, 0)
	_, err := r.museSearch(context.Background(), DiscoverQuery{Term: "go", Location: "Denver"}, fetchOptions{Results: 10}, []string{"Software Engineering"})
	if err == nil || !strings.Contains(err.Error(), "Denver") {
		t.Fatalf("err = %v", err)
	}
}

func TestJobicyCooldown(t *testing.T) {
	r := newTestRepo(t)
	if next, ok, err := r.takeSourceSlot("jobicy", time.Hour); !ok || err != nil {
		t.Fatalf("first call should be allowed: %v %v %v", next, ok, err)
	}
	setNow(r, 2026, time.October, 1, 12) // same time: a second search right away
	next, ok, err := r.takeSourceSlot("jobicy", time.Hour)
	if ok || err != nil || !next.Equal(time.Date(2026, 10, 1, 13, 0, 0, 0, time.Local)) {
		t.Fatalf("second call within the hour should wait until 13:00: %v %v %v", next, ok, err)
	}
	setNow(r, 2026, time.October, 1, 13)
	if _, ok, _ := r.takeSourceSlot("jobicy", time.Hour); !ok {
		t.Fatal("allowed again after an hour")
	}
}
