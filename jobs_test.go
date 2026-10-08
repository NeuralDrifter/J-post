// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

package main

import (
	"errors"
	"path/filepath"
	"testing"
)

func mustCreate(t *testing.T, r *Repo, j Job) Job {
	t.Helper()
	created, err := r.CreateJob(j)
	if err != nil {
		t.Fatalf("CreateJob: %v", err)
	}
	return created
}

func TestCreateJobDefaultsAndCreationEvent(t *testing.T) {
	r := newTestRepo(t)
	j := mustCreate(t, r, Job{Company: "  Acme ", Position: "Dev"})
	if j.ID == "" || j.Status != StatusInterested || j.Source != "manual" || j.Company != "Acme" {
		t.Fatalf("unexpected job: %+v", j)
	}
	if j.DateApplied != "" {
		t.Fatalf("interested job should have no date applied, got %q", j.DateApplied)
	}
	events, err := r.ListStageEvents(j.ID)
	if err != nil || len(events) != 1 || events[0].FromStatus != "" || events[0].ToStatus != StatusInterested {
		t.Fatalf("events = %+v, %v", events, err)
	}
}

func TestCreateJobValidation(t *testing.T) {
	r := newTestRepo(t)
	five, four := int64(5), int64(4)
	cases := map[string]Job{
		"missing company":       {Position: "Dev"},
		"missing position":      {Company: "Acme"},
		"closed without reason": {Company: "Acme", Position: "Dev", Status: StatusClosed},
		"reason on open job":    {Company: "Acme", Position: "Dev", Status: StatusApplied, CloseReason: "rejected"},
		"bad status":            {Company: "Acme", Position: "Dev", Status: "hired"},
		"bad work mode":         {Company: "Acme", Position: "Dev", WorkMode: "moon"},
		"min above max":         {Company: "Acme", Position: "Dev", SalaryMin: &five, SalaryMax: &four},
		"bad date":              {Company: "Acme", Position: "Dev", FollowUpOn: "next week"},
	}
	for name, j := range cases {
		if _, err := r.CreateJob(j); err == nil {
			t.Errorf("%s: expected error", name)
		}
	}
}

func TestCreateAppliedJobSetsDateApplied(t *testing.T) {
	r := newTestRepo(t)
	j := mustCreate(t, r, Job{Company: "Acme", Position: "Dev", Status: StatusApplied})
	if j.DateApplied != "2026-10-01" {
		t.Fatalf("DateApplied = %q", j.DateApplied)
	}
}

func TestGetJobNotFound(t *testing.T) {
	r := newTestRepo(t)
	if _, err := r.GetJob("nope"); !errors.Is(err, ErrNotFound) {
		t.Fatalf("err = %v, want ErrNotFound", err)
	}
}

func TestUpdateJobKeepsStatusAndNotes(t *testing.T) {
	r := newTestRepo(t)
	j := mustCreate(t, r, Job{Company: "Acme", Position: "Dev", Notes: "original"})
	j.Position = "Senior Dev"
	j.Status = StatusOffer
	j.Notes = "stale copy"
	updated, err := r.UpdateJob(j)
	if err != nil {
		t.Fatal(err)
	}
	got, _ := r.GetJob(j.ID)
	if got.Position != "Senior Dev" || got.Status != StatusInterested || got.Notes != "original" || updated.Status != StatusInterested {
		t.Fatalf("got %+v", got)
	}
}

func TestUpdateJobNotes(t *testing.T) {
	r := newTestRepo(t)
	j := mustCreate(t, r, Job{Company: "Acme", Position: "Dev"})
	if err := r.UpdateJobNotes(j.ID, "# Prep\n- STAR stories"); err != nil {
		t.Fatal(err)
	}
	got, _ := r.GetJob(j.ID)
	if got.Notes != "# Prep\n- STAR stories" {
		t.Fatalf("notes = %q", got.Notes)
	}
	if err := r.UpdateJobNotes("nope", "x"); !errors.Is(err, ErrNotFound) {
		t.Fatalf("err = %v", err)
	}
}

func TestChangeStatusWritesEvents(t *testing.T) {
	r := newTestRepo(t)
	j := mustCreate(t, r, Job{Company: "Acme", Position: "Dev"})
	j, err := r.ChangeStatus(j.ID, StatusApplied, "", "")
	if err != nil || j.DateApplied != "2026-10-01" {
		t.Fatalf("apply: %+v %v", j, err)
	}
	j, err = r.ChangeStatus(j.ID, StatusClosed, "ghosted", "no reply in 3 weeks")
	if err != nil || j.CloseReason != "ghosted" {
		t.Fatalf("close: %+v %v", j, err)
	}
	events, _ := r.ListStageEvents(j.ID)
	if len(events) != 3 {
		t.Fatalf("want 3 events, got %+v", events)
	}
	last := events[2]
	if last.FromStatus != StatusApplied || last.ToStatus != StatusClosed || last.CloseReason != "ghosted" || last.Note != "no reply in 3 weeks" {
		t.Fatalf("last event = %+v", last)
	}
	j, err = r.ChangeStatus(j.ID, StatusApplied, "", "they wrote back")
	if err != nil || j.CloseReason != "" {
		t.Fatalf("reopen: %+v %v", j, err)
	}
}

func TestChangeStatusSameIsNoop(t *testing.T) {
	r := newTestRepo(t)
	j := mustCreate(t, r, Job{Company: "Acme", Position: "Dev", Status: StatusApplied})
	if _, err := r.ChangeStatus(j.ID, StatusApplied, "", ""); err != nil {
		t.Fatal(err)
	}
	events, _ := r.ListStageEvents(j.ID)
	if len(events) != 1 {
		t.Fatalf("same-status change wrote an event: %+v", events)
	}
}

func TestChangeStatusRequiresReasonForClosed(t *testing.T) {
	r := newTestRepo(t)
	j := mustCreate(t, r, Job{Company: "Acme", Position: "Dev"})
	if _, err := r.ChangeStatus(j.ID, StatusClosed, "", ""); err == nil {
		t.Fatal("expected error")
	}
	if _, err := r.ChangeStatus("nope", StatusApplied, "", ""); !errors.Is(err, ErrNotFound) {
		t.Fatalf("err = %v", err)
	}
}

func TestDeleteJobCascadesEvents(t *testing.T) {
	r := newTestRepo(t)
	j := mustCreate(t, r, Job{Company: "Acme", Position: "Dev"})
	if err := r.DeleteJob(j.ID); err != nil {
		t.Fatal(err)
	}
	var n int
	r.db.QueryRow(`SELECT COUNT(*) FROM stage_events WHERE job_id = ?`, j.ID).Scan(&n)
	if n != 0 {
		t.Fatalf("%d orphan events", n)
	}
	if err := r.DeleteJob(j.ID); !errors.Is(err, ErrNotFound) {
		t.Fatalf("second delete err = %v", err)
	}
}

func TestListJobsReturnsEmptySlice(t *testing.T) {
	r := newTestRepo(t)
	jobs, err := r.ListJobs()
	if err != nil || jobs == nil || len(jobs) != 0 {
		t.Fatalf("jobs = %#v, %v", jobs, err)
	}
}

func TestMigration4RenamesWishlistToInterested(t *testing.T) {
	path := filepath.Join(t.TempDir(), "old.db")
	db, err := openDBWith(path, migrations[:3])
	if err != nil {
		t.Fatal(err)
	}
	stamp := "2026-09-01T12:00:00.000Z"
	if _, err := db.Exec(`INSERT INTO jobs (id, company, position, status, created_at, updated_at) VALUES ('j1', 'Acme', 'Dev', 'wishlist', ?, ?)`, stamp, stamp); err != nil {
		t.Fatal(err)
	}
	db.Exec(`INSERT INTO stage_events (id, job_id, from_status, to_status, at) VALUES ('e1', 'j1', NULL, 'wishlist', ?)`, stamp)
	db.Exec(`INSERT INTO stage_events (id, job_id, from_status, to_status, at) VALUES ('e2', 'j1', 'wishlist', 'applied', ?)`, stamp)
	db.Close()

	db, err = openDB(path)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	r := NewRepo(db, t.TempDir())
	j, err := r.GetJob("j1")
	if err != nil || j.Status != StatusInterested {
		t.Fatalf("job = %+v, %v", j, err)
	}
	events, _ := r.ListStageEvents("j1")
	if len(events) != 2 || events[0].ToStatus != StatusInterested || events[1].FromStatus != StatusInterested {
		t.Fatalf("events = %+v", events)
	}
}
