// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

package app

import (
	"errors"
	"slices"
	"strings"
	"testing"
	"time"

	"jobtrack/internal/discover"
)

func result(company, title, url, source string) discover.DiscoverResult {
	return discover.FromRaw(discover.RawJob{Title: title, Company: company, URL: url, Description: "desc from " + source}, source)
}

func mustUpsert(t *testing.T, r *Repo, results ...discover.DiscoverResult) int {
	t.Helper()
	n, err := r.UpsertPostings(results, "")
	if err != nil {
		t.Fatalf("UpsertPostings: %v", err)
	}
	return n
}

func mustList(t *testing.T, r *Repo, f PostingFilter) []Posting {
	t.Helper()
	list, err := r.ListPostings(f)
	if err != nil {
		t.Fatalf("ListPostings: %v", err)
	}
	return list
}

func TestUpsertMergesAcrossSearches(t *testing.T) {
	r := newTestRepo(t)
	if n := mustUpsert(t, r, result("Acme", "Go Dev", "", "indeed")); n != 1 {
		t.Fatalf("new = %d", n)
	}
	longer := result("ACME", "go  dev", "https://acme.test/1", "linkedin")
	longer.Description = "a much longer description than before"
	if n := mustUpsert(t, r, longer); n != 0 {
		t.Fatalf("re-found posting counted as new: %d", n)
	}
	// Same URL, different title spelling → still the same posting.
	if n := mustUpsert(t, r, result("Acme Inc", "Golang Developer", "https://acme.test/1", "adzuna")); n != 0 {
		t.Fatalf("same URL counted as new: %d", n)
	}
	list := mustList(t, r, PostingFilter{Tab: "inbox"})
	if len(list) != 1 {
		t.Fatalf("want 1 posting, got %+v", list)
	}
	p := list[0]
	if strings.Join(p.Sources, ",") != "indeed,linkedin,adzuna" || p.URL != "https://acme.test/1" || p.Description != "a much longer description than before" || p.State != "new" {
		t.Fatalf("merged = %+v", p)
	}
}

func TestDismissSurvivesRescrape(t *testing.T) {
	r := newTestRepo(t)
	mustUpsert(t, r, result("Acme", "Go Dev", "", "indeed"))
	p := mustList(t, r, PostingFilter{Tab: "inbox"})[0]
	if err := r.DismissPosting(p.ID); err != nil {
		t.Fatal(err)
	}
	mustUpsert(t, r, result("Acme", "Go Dev", "", "linkedin"))
	if inbox := mustList(t, r, PostingFilter{Tab: "inbox"}); len(inbox) != 0 {
		t.Fatalf("dismissed posting came back: %+v", inbox)
	}
	dismissed := mustList(t, r, PostingFilter{Tab: "dismissed"})
	if len(dismissed) != 1 || dismissed[0].DismissedAt == "" {
		t.Fatalf("dismissed = %+v", dismissed)
	}
	if err := r.RestorePosting(p.ID); err != nil {
		t.Fatal(err)
	}
	inbox := mustList(t, r, PostingFilter{Tab: "inbox"})
	if len(inbox) != 1 || inbox[0].State != "seen" || inbox[0].DismissedAt != "" {
		t.Fatalf("restored = %+v", inbox)
	}
}

func TestSavePostingTwice(t *testing.T) {
	r := newTestRepo(t)
	res := result("Acme", "Go Dev", "https://acme.test/1", "indeed")
	lo := int64(120000)
	res.SalaryMin = &lo
	mustUpsert(t, r, res)
	p := mustList(t, r, PostingFilter{Tab: "inbox"})[0]
	j, err := r.SavePosting(p.ID)
	if err != nil {
		t.Fatal(err)
	}
	if j.Company != "Acme" || j.Position != "Go Dev" || j.Status != StatusInterested || j.URL != "https://acme.test/1" || j.Source != "indeed" || *j.SalaryMin != 120000 {
		t.Fatalf("job = %+v", j)
	}
	again, err := r.SavePosting(p.ID)
	if err != nil || again.ID != j.ID {
		t.Fatalf("second save made a new job: %+v %v", again, err)
	}
	saved := mustList(t, r, PostingFilter{Tab: "saved"})
	if len(saved) != 1 || saved[0].JobID != j.ID || saved[0].JobStatus != StatusInterested {
		t.Fatalf("saved = %+v", saved)
	}
}

func TestSavedPostingAfterJobDeleted(t *testing.T) {
	r := newTestRepo(t)
	mustUpsert(t, r, result("Acme", "Go Dev", "", "indeed"))
	p := mustList(t, r, PostingFilter{Tab: "inbox"})[0]
	j, _ := r.SavePosting(p.ID)
	if err := r.DeleteJob(j.ID); err != nil {
		t.Fatal(err)
	}
	mustUpsert(t, r, result("Acme", "Go Dev", "", "linkedin"))
	if inbox := mustList(t, r, PostingFilter{Tab: "inbox"}); len(inbox) != 0 {
		t.Fatalf("posting of a deleted job reappeared: %+v", inbox)
	}
	saved := mustList(t, r, PostingFilter{Tab: "saved"})
	if len(saved) != 1 || saved[0].JobID != "" {
		t.Fatalf("saved = %+v", saved)
	}
	// Saving again creates a fresh job rather than failing.
	if j2, err := r.SavePosting(p.ID); err != nil || j2.ID == j.ID {
		t.Fatalf("re-save = %+v %v", j2, err)
	}
}

func TestSavePostingReportsUnreadableJobInsteadOfDuplicating(t *testing.T) {
	r := newTestRepo(t)
	mustUpsert(t, r, result("Acme", "Go Dev", "", "indeed"))
	p := mustList(t, r, PostingFilter{Tab: "inbox"})[0]
	j, err := r.SavePosting(p.ID)
	if err != nil {
		t.Fatal(err)
	}
	// Text in an INTEGER column makes the job row fail to scan: a real error, not "not found".
	if _, err := r.db.Exec(`UPDATE jobs SET salary_min = 'abc' WHERE id = ?`, j.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := r.SavePosting(p.ID); err == nil || errors.Is(err, ErrNotFound) {
		t.Fatalf("err = %v, want the read error", err)
	}
	var jobs int
	if err := r.db.QueryRow(`SELECT COUNT(*) FROM jobs`).Scan(&jobs); err != nil || jobs != 1 {
		t.Fatalf("jobs = %d, %v; a failed read must not add a duplicate job", jobs, err)
	}
}

func TestAutoSavedWhenAlreadyTracked(t *testing.T) {
	r := newTestRepo(t)
	j := mustCreate(t, r, Job{Company: "Acme", Position: "Go Dev", Status: StatusApplied})
	if n := mustUpsert(t, r, result("acme", "GO DEV", "", "indeed")); n != 0 {
		t.Fatalf("tracked posting counted as new: %d", n)
	}
	saved := mustList(t, r, PostingFilter{Tab: "saved"})
	if len(saved) != 1 || saved[0].JobID != j.ID || saved[0].JobStatus != StatusApplied {
		t.Fatalf("saved = %+v", saved)
	}
}

func TestPostingTabsAndFilters(t *testing.T) {
	r := newTestRepo(t)
	mustUpsert(t, r,
		result("Acme", "Go Dev", "", "indeed"),
		result("Brex", "Product Manager", "", "linkedin"),
		result("Cora", "Go Engineer", "", "linkedin"),
	)
	all := mustList(t, r, PostingFilter{Tab: "inbox"})
	if len(all) != 3 {
		t.Fatalf("inbox = %d", len(all))
	}
	if got := mustList(t, r, PostingFilter{Tab: "inbox", Query: "go"}); len(got) != 2 {
		t.Errorf("query: %d", len(got))
	}
	if got := mustList(t, r, PostingFilter{Tab: "inbox", Source: "linkedin"}); len(got) != 2 {
		t.Errorf("source: %d", len(got))
	}
	if err := r.MarkPostingSeen(all[0].ID); err != nil {
		t.Fatal(err)
	}
	if got := mustList(t, r, PostingFilter{Tab: "inbox", OnlyNew: true}); len(got) != 2 {
		t.Errorf("only new: %d", len(got))
	}
	c, err := r.InboxCounts()
	if err != nil || c.New != 2 || c.Inbox != 3 || c.Saved != 0 || c.Dismissed != 0 {
		t.Fatalf("counts = %+v %v", c, err)
	}
	if err := r.MarkPostingSeen("nope"); !errors.Is(err, ErrNotFound) {
		t.Fatalf("err = %v", err)
	}
	if empty := mustList(t, r, PostingFilter{Tab: "dismissed"}); empty == nil || len(empty) != 0 {
		t.Fatalf("empty tab should be [] not nil: %#v", empty)
	}
}

func TestClearDismissed(t *testing.T) {
	r := newTestRepo(t)
	mustUpsert(t, r, result("Old", "Dev", "", "indeed"), result("Recent", "Dev", "", "indeed"))
	list := mustList(t, r, PostingFilter{Tab: "inbox"})
	byCompany := map[string]string{}
	for _, p := range list {
		byCompany[p.Company] = p.ID
	}
	setNow(r, 2026, time.June, 1, 12)
	r.DismissPosting(byCompany["Old"])
	setNow(r, 2026, time.September, 25, 12)
	r.DismissPosting(byCompany["Recent"])
	setNow(r, 2026, time.October, 1, 12)
	n, err := r.ClearDismissed(90)
	if err != nil || n != 1 {
		t.Fatalf("cleared %d, %v", n, err)
	}
	left := mustList(t, r, PostingFilter{Tab: "dismissed"})
	if len(left) != 1 || left[0].Company != "Recent" {
		t.Fatalf("left = %+v", left)
	}
}

func TestSavePostingLeavesNoJobWhenPostingUpdateFails(t *testing.T) {
	r := newTestRepo(t)
	mustUpsert(t, r, result("Acme", "Go Dev", "https://acme.test/1", "indeed"))
	p := mustList(t, r, PostingFilter{Tab: "inbox"})[0]
	if _, err := r.db.Exec(`CREATE TRIGGER fail_save BEFORE UPDATE OF state ON postings
		BEGIN SELECT RAISE(ABORT, 'simulated failure'); END`); err != nil {
		t.Fatal(err)
	}
	if _, err := r.SavePosting(p.ID); err == nil {
		t.Fatal("SavePosting should fail")
	}
	if jobs, _ := r.ListJobs(); len(jobs) != 0 {
		t.Fatalf("orphaned job left behind: %+v", jobs)
	}
}

func TestTrackedJobIDs(t *testing.T) {
	results := []discover.DiscoverResult{
		discover.FromRaw(discover.RawJob{Title: "Dev", Company: "Acme"}, "indeed"),
		discover.FromRaw(discover.RawJob{Title: "Different title", Company: "Brex", URL: "https://brex.test/9"}, "indeed"),
		discover.FromRaw(discover.RawJob{Title: "New", Company: "Cora"}, "indeed"),
	}
	jobs := []Job{
		{ID: "j1", Company: "ACME", Position: "dev", Status: StatusApplied},
		{ID: "j2", Company: "Brex", Position: "PM", URL: "https://brex.test/9", Status: StatusInterested},
		{ID: "j3", Company: "Cora", Position: "Other"},
	}
	got := trackedJobIDs(results, jobs)
	if want := []string{"j1", "j2", ""}; !slices.Equal(got, want) {
		t.Fatalf("got %q, want %q (by company+title, else by URL)", got, want)
	}
}
