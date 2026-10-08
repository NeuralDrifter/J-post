// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

package main

import (
	"testing"
	"time"
)

func TestInterviewCRUDAndOrdering(t *testing.T) {
	r := newTestRepo(t)
	j := mustCreate(t, r, Job{Company: "Acme", Position: "Dev"})
	later := time.Date(2026, 10, 9, 10, 0, 0, 0, time.Local).Format(time.RFC3339)
	sooner := time.Date(2026, 10, 2, 15, 0, 0, 0, time.Local).Format(time.RFC3339)

	a, err := r.SaveInterview(Interview{JobID: j.ID, Kind: "technical", ScheduledAt: later, DurationMin: 60})
	if err != nil {
		t.Fatal(err)
	}
	b, err := r.SaveInterview(Interview{JobID: j.ID, Kind: "phone_screen", ScheduledAt: sooner, DurationMin: 30})
	if err != nil {
		t.Fatal(err)
	}
	if b.ScheduledAt != ts(time.Date(2026, 10, 2, 15, 0, 0, 0, time.Local)) {
		t.Fatalf("scheduledAt not normalized: %q", b.ScheduledAt)
	}
	b.Completed = true
	if _, err := r.SaveInterview(b); err != nil {
		t.Fatal(err)
	}
	list, _ := r.ListInterviews(j.ID)
	if len(list) != 2 || list[0].ID != a.ID || !list[1].Completed {
		t.Fatalf("want upcoming first, completed last: %+v", list)
	}
	if err := r.DeleteInterview(a.ID); err != nil {
		t.Fatal(err)
	}
}

func TestInterviewValidation(t *testing.T) {
	r := newTestRepo(t)
	j := mustCreate(t, r, Job{Company: "Acme", Position: "Dev"})
	good := time.Date(2026, 10, 2, 15, 0, 0, 0, time.Local).Format(time.RFC3339)
	bad := []Interview{
		{JobID: j.ID, Kind: "coffee", ScheduledAt: good},
		{JobID: j.ID, Kind: "technical", ScheduledAt: "tomorrow"},
		{JobID: j.ID, Kind: "technical", ScheduledAt: good, DurationMin: -5},
		{JobID: "nope", Kind: "technical", ScheduledAt: good},
	}
	for i, iv := range bad {
		if _, err := r.SaveInterview(iv); err == nil {
			t.Errorf("case %d: expected error", i)
		}
	}
}
