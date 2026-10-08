// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

package main

import (
	"errors"
	"os"
	"path/filepath"
	"testing"
)

func writeLegacy(t *testing.T, content string) string {
	t.Helper()
	p := filepath.Join(t.TempDir(), "data.json")
	if err := os.WriteFile(p, []byte(content), 0o644); err != nil {
		t.Fatal(err)
	}
	return p
}

func jobsByCompany(t *testing.T, r *Repo) map[string]Job {
	t.Helper()
	jobs, err := r.ListJobs()
	if err != nil {
		t.Fatal(err)
	}
	out := map[string]Job{}
	for _, j := range jobs {
		out[j.Company] = j
	}
	return out
}

func TestImportLegacyBasic(t *testing.T) {
	r := newTestRepo(t)
	p := writeLegacy(t, `[
		{"id":"a","company":"Acme","position":"Dev","status":"Applied","dateApplied":"2026-09-01","notes":"n1","updatedAt":"2026-09-02T10:00:00Z"},
		{"id":"b","company":"Brex","position":"PM","status":"Wishlist","dateApplied":"","notes":"","updatedAt":"2026-09-03T10:00:00Z"},
		{"id":"c","company":"Cora","position":"Eng","status":"Offer","dateApplied":"2026-08-01","notes":"","updatedAt":"2026-09-04T10:00:00Z"}
	]`)
	n, err := r.ImportLegacy(p)
	if err != nil || n != 3 {
		t.Fatalf("n=%d err=%v", n, err)
	}
	got := jobsByCompany(t, r)
	if got["Acme"].Status != StatusApplied || got["Acme"].Notes != "n1" || got["Acme"].DateApplied != "2026-09-01" {
		t.Errorf("Acme = %+v", got["Acme"])
	}
	if got["Brex"].Status != StatusInterested || got["Cora"].Status != StatusOffer {
		t.Errorf("statuses: %+v", got)
	}
	if _, err := os.Stat(p); !errors.Is(err, os.ErrNotExist) {
		t.Error("data.json should have been renamed")
	}
	if _, err := os.Stat(p + ".bak"); err != nil {
		t.Errorf("backup missing: %v", err)
	}
	events, _ := r.ListStageEvents(got["Acme"].ID)
	if len(events) != 1 || events[0].At != "2026-09-02T10:00:00.000Z" || events[0].Note != "imported" {
		t.Errorf("events = %+v", events)
	}
}

func TestImportLegacyMessyRecords(t *testing.T) {
	r := newTestRepo(t)
	p := writeLegacy(t, `[
		{"company":"Acme","position":"Dev","status":"Phone screen","dateApplied":"last tuesday"},
		{"company":"Dune","position":"Dev","status":"Interested"},
		{"company":"","position":"","status":""}
	]`)
	n, err := r.ImportLegacy(p)
	if err != nil || n != 3 {
		t.Fatalf("n=%d err=%v", n, err)
	}
	got := jobsByCompany(t, r)
	if got["Dune"].Status != StatusInterested {
		t.Errorf("Dune = %+v", got["Dune"])
	}
	if j := got["Acme"]; j.Status != StatusInterested || j.DateApplied != "" {
		t.Errorf("Acme = %+v", j)
	}
	if j := got["(unknown company)"]; j.Position != "(unknown position)" || j.Status != StatusInterested {
		t.Errorf("blank record = %+v", j)
	}
}

func TestImportLegacyRejectedGetsAppliedEvent(t *testing.T) {
	r := newTestRepo(t)
	p := writeLegacy(t, `[{"company":"Acme","position":"Dev","status":"Rejected","dateApplied":"2026-09-01","updatedAt":"2026-09-10T10:00:00Z"}]`)
	if _, err := r.ImportLegacy(p); err != nil {
		t.Fatal(err)
	}
	j := jobsByCompany(t, r)["Acme"]
	if j.Status != StatusClosed || j.CloseReason != "rejected" {
		t.Fatalf("job = %+v", j)
	}
	events, _ := r.ListStageEvents(j.ID)
	if len(events) != 2 || events[0].ToStatus != StatusApplied || events[1].FromStatus != StatusApplied || events[1].CloseReason != "rejected" {
		t.Fatalf("events = %+v", events)
	}
	m, _ := r.GetMetrics(7)
	if m.AppliedCount != 1 {
		t.Errorf("rejected job should count as applied, got %+v", m)
	}
}

func TestImportLegacySkipsWhenJobsExist(t *testing.T) {
	r := newTestRepo(t)
	mustCreate(t, r, Job{Company: "Existing", Position: "Dev"})
	p := writeLegacy(t, `[{"company":"Acme","position":"Dev","status":"Applied"}]`)
	if n, err := r.ImportLegacy(p); err != nil || n != 0 {
		t.Fatalf("n=%d err=%v", n, err)
	}
	if _, err := os.Stat(p); err != nil {
		t.Fatal("file should be left alone")
	}
}

func TestImportLegacyInvalidJSONKeepsFile(t *testing.T) {
	r := newTestRepo(t)
	p := writeLegacy(t, `{not json`)
	if _, err := r.ImportLegacy(p); err == nil {
		t.Fatal("expected error")
	}
	if _, err := os.Stat(p); err != nil {
		t.Fatal("file must not be renamed on failure")
	}
}

func TestImportLegacyMissingFile(t *testing.T) {
	r := newTestRepo(t)
	if n, err := r.ImportLegacy(filepath.Join(t.TempDir(), "data.json")); err != nil || n != 0 {
		t.Fatalf("n=%d err=%v", n, err)
	}
}
