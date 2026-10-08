// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

package app

import (
	"context"
	"net/http"
	"strings"
	"testing"

	"jobtrack/internal/discover"
	"jobtrack/internal/settings"
)

func TestListJobSourcesOrderAndReadiness(t *testing.T) {
	list := ListJobSources(settings.Settings{})
	var ids []string
	for _, s := range list {
		ids = append(ids, s.ID)
	}
	if got := strings.Join(ids, ","); got != "adzuna,usajobs,himalayas,jobicy,themuse,indeed,linkedin,zip_recruiter" {
		t.Fatalf("ids = %s", got)
	}
	unavailable := map[string]string{}
	for _, s := range list {
		if s.Unavailable != "" {
			unavailable[s.ID] = s.Unavailable
		}
	}
	if len(unavailable) != 3 || unavailable["adzuna"] == "" || unavailable["usajobs"] == "" || unavailable["themuse"] == "" {
		t.Fatalf("unavailable = %v", unavailable)
	}

	ready := ListJobSources(settings.Settings{AdzunaAppID: "id", AdzunaAppKey: "k", USAJobsKey: "k", USAJobsEmail: "a@b.c", MuseCategories: []string{"Data"}})
	for _, s := range ready {
		if s.Unavailable != "" {
			t.Errorf("%s still unavailable: %s", s.ID, s.Unavailable)
		}
	}
}

func TestSourceFetcherRefusesUnconfiguredSource(t *testing.T) {
	f := sourceFetcher{repo: newTestRepo(t)}
	for _, id := range []string{"adzuna", "usajobs", "themuse"} {
		if _, err := f.fetch(context.Background(), id, discover.DiscoverQuery{Term: "x"}, discover.FetchOptions{}); err == nil || !strings.Contains(err.Error(), "Settings") {
			t.Errorf("%s: err = %v", id, err)
		}
	}
	if _, err := f.fetch(context.Background(), "nope", discover.DiscoverQuery{Term: "x"}, discover.FetchOptions{}); err == nil {
		t.Error("unknown source should error")
	}
}

func TestSourceFetcherRateLimitsJobicy(t *testing.T) {
	url := fakeServer(t, func(w http.ResponseWriter, r *http.Request) { w.Write([]byte(`{"jobs":[]}`)) })
	discover.SetTestJobicy(t, url)

	f := sourceFetcher{repo: newTestRepo(t)}
	if _, err := f.fetch(context.Background(), "jobicy", discover.DiscoverQuery{Term: "x"}, discover.FetchOptions{}); err != nil {
		t.Fatal(err)
	}
	if _, err := f.fetch(context.Background(), "jobicy", discover.DiscoverQuery{Term: "x"}, discover.FetchOptions{}); err == nil || !strings.Contains(err.Error(), "skipped") {
		t.Fatalf("second call within the hour: err = %v", err)
	}
}
