// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

package app

import (
	"testing"

	"jobtrack/internal/discover"
)

// addPostings stores one inbox posting per title and returns them newest first.
func addPostings(t *testing.T, r *Repo, titles ...string) []Posting {
	t.Helper()
	var results []discover.DiscoverResult
	for _, title := range titles {
		results = append(results, discover.FromRaw(discover.RawJob{Title: title, Company: "Acme", URL: "https://acme.test/" + title, Description: "Build Go services"}, "indeed"))
	}
	if _, err := r.UpsertPostings(results, ""); err != nil {
		t.Fatal(err)
	}
	ps, err := r.ListPostings(PostingFilter{Tab: "inbox"})
	if err != nil {
		t.Fatal(err)
	}
	return ps
}

// newTestApp opens an App on a temp folder and closes its database when the
// test ends (Windows can't delete the folder while the file is open).
func newTestApp(t *testing.T) *App {
	t.Helper()
	a := NewApp(t.TempDir())
	if a.initErr != nil {
		t.Fatal(a.initErr)
	}
	t.Cleanup(func() { a.repo.db.Close() })
	return a
}

func sampleScore(overall int) MatchScore {
	f := MatchFactors{ResumeFit: factor(overall), Salary: MatchFactor{Note: "no salary listed"}}
	return MatchScore{Overall: overall, Factors: f, Strengths: []string{"Go"}, Gaps: []string{}, Provider: "anthropic", Model: "claude-opus-5-5"}
}

func TestSaveAndListMatchScores(t *testing.T) {
	r := newTestRepo(t)
	ps := addPostings(t, r, "Go Dev", "PM")
	if ps[0].Match != nil {
		t.Fatal("a new posting has no score")
	}
	if err := r.saveMatchScore(ps[0].ID, sampleScore(81), "fp1"); err != nil {
		t.Fatal(err)
	}
	if err := r.saveMatchScore(ps[0].ID, sampleScore(64), "fp2"); err != nil { // re-score replaces
		t.Fatal(err)
	}
	got, err := r.GetPosting(ps[0].ID)
	if err != nil || got.Match == nil {
		t.Fatalf("got %+v, %v", got, err)
	}
	m := got.Match
	if m.Overall != 64 || m.fingerprint != "fp2" || m.Provider != "anthropic" || m.Model != "claude-opus-5-5" || m.ScoredAt == "" ||
		m.Factors.Salary.Note != "no salary listed" || len(m.Strengths) != 1 || m.Gaps == nil {
		t.Fatalf("match = %+v", m)
	}
	var rows int
	r.db.QueryRow(`SELECT COUNT(*) FROM posting_scores`).Scan(&rows)
	if rows != 1 {
		t.Fatalf("rows = %d, want 1 (replaced, not added)", rows)
	}
}

func TestUnreadableStoredScoreCountsAsUnscored(t *testing.T) {
	for _, column := range []string{"factors", "strengths", "gaps"} {
		r := newTestRepo(t)
		ps := addPostings(t, r, "Go Dev")
		if err := r.saveMatchScore(ps[0].ID, sampleScore(81), "fp"); err != nil {
			t.Fatal(err)
		}
		if _, err := r.db.Exec(`UPDATE posting_scores SET ` + column + ` = 'not json'`); err != nil {
			t.Fatal(err)
		}
		got, err := r.GetPosting(ps[0].ID)
		if err != nil {
			t.Fatalf("%s: one bad score must not break the listing: %v", column, err)
		}
		if got.Match != nil {
			t.Errorf("%s unreadable: match = %+v, want unscored so it can be scored again", column, got.Match)
		}
	}
}

func TestSaveMatchScoreSkipsDeletedPosting(t *testing.T) {
	r := newTestRepo(t)
	ps := addPostings(t, r, "Go Dev")
	r.db.Exec(`DELETE FROM postings WHERE id = ?`, ps[0].ID)
	if err := r.saveMatchScore(ps[0].ID, sampleScore(70), "fp"); err != nil {
		t.Fatalf("a posting deleted mid-run must be skipped, got %v", err)
	}
	var rows int
	r.db.QueryRow(`SELECT COUNT(*) FROM posting_scores`).Scan(&rows)
	if rows != 0 {
		t.Fatalf("rows = %d", rows)
	}
}

func TestDeletingPostingDeletesScore(t *testing.T) {
	r := newTestRepo(t)
	ps := addPostings(t, r, "Go Dev")
	r.saveMatchScore(ps[0].ID, sampleScore(70), "fp")
	if _, err := r.db.Exec(`DELETE FROM postings WHERE id = ?`, ps[0].ID); err != nil {
		t.Fatal(err)
	}
	var rows int
	r.db.QueryRow(`SELECT COUNT(*) FROM posting_scores`).Scan(&rows)
	if rows != 0 {
		t.Fatalf("score should go with its posting, rows = %d", rows)
	}
}

func TestMarkOutdated(t *testing.T) {
	ps := []Posting{{ID: "a", Match: &MatchScore{fingerprint: "old"}}, {ID: "b", Match: &MatchScore{fingerprint: "now"}}, {ID: "c"}}
	markOutdated(ps, func(string) string { return "now" })
	if !ps[0].Match.Outdated || ps[1].Match.Outdated || ps[2].Match != nil {
		t.Fatalf("ps = %+v %+v %+v", ps[0].Match, ps[1].Match, ps[2].Match)
	}
}

func TestAppListPostingsFlagsOutdatedScores(t *testing.T) {
	a := newTestApp(t)
	a.repo.UpdateResumeText("Jane Doe, Go")
	ps := addPostings(t, a.repo, "Go Dev")
	s, err := a.settings.Load()
	if err != nil {
		t.Fatal(err)
	}
	a.repo.saveMatchScore(ps[0].ID, sampleScore(80), matchFingerprint("Jane Doe, Go", s))
	list, _ := a.ListPostings(PostingFilter{Tab: "inbox"})
	if list[0].Match == nil || list[0].Match.Outdated {
		t.Fatalf("fresh score shown as outdated: %+v", list[0].Match)
	}
	a.repo.UpdateResumeText("Jane Doe, Rust")
	list, _ = a.ListPostings(PostingFilter{Tab: "inbox"})
	if !list[0].Match.Outdated {
		t.Fatal("a resume change must mark the score outdated")
	}
}

func TestAppScoresKeepTheResumeTheyWereGradedAgainst(t *testing.T) {
	a := newTestApp(t)
	a.repo.UpdateResumeText("Jane Doe, Go")
	chosen, err := a.repo.CreateDocument(DocumentResume, "Rust resume", `{}`, "Jane Doe, Rust")
	if err != nil {
		t.Fatal(err)
	}
	ps := addPostings(t, a.repo, "Rust Dev")
	s, _ := a.settings.Load()
	score := sampleScore(77)
	score.ResumeID = chosen.ID
	a.repo.saveMatchScore(ps[0].ID, score, matchFingerprint("Jane Doe, Rust", s))

	list, _ := a.ListPostings(PostingFilter{Tab: "inbox"})
	if m := list[0].Match; m == nil || m.ResumeID != chosen.ID || m.Outdated {
		t.Fatalf("score graded against a chosen resume = %+v", m)
	}
	a.repo.UpdateResumeText("Jane Doe, Go and Python")
	if list, _ = a.ListPostings(PostingFilter{Tab: "inbox"}); list[0].Match.Outdated {
		t.Fatal("changing the default resume outdated a score graded against another resume")
	}
	a.repo.SaveDocument(chosen.ID, `{}`, "Jane Doe, Rust and C", "")
	if list, _ = a.ListPostings(PostingFilter{Tab: "inbox"}); !list[0].Match.Outdated {
		t.Fatal("changing the chosen resume must outdate its scores")
	}
}

func TestOutdatedByResumeGroupsChangedScoresByTheirResume(t *testing.T) {
	ps := []Posting{
		{ID: "a", Match: &MatchScore{ResumeID: "", fingerprint: "old"}},
		{ID: "b", Match: &MatchScore{ResumeID: "r1", fingerprint: "r1-old"}},
		{ID: "c", Match: &MatchScore{ResumeID: "r1", fingerprint: "r1-now"}},
		{ID: "d", Match: &MatchScore{ResumeID: "", fingerprint: "now"}},
	}
	groups := outdatedByResume(ps, map[string]string{"": "now", "r1": "r1-now"})
	if len(groups) != 2 || len(groups[""]) != 1 || groups[""][0].ID != "a" || len(groups["r1"]) != 1 || groups["r1"][0].ID != "b" {
		t.Fatalf("groups = %+v", groups)
	}
}

func TestMatchRunAddKeepsTheLastError(t *testing.T) {
	total := MatchRun{Scored: 2, Total: 2}
	total.add(MatchRun{Scored: 1, Failed: 1, Total: 2, Error: "boom"})
	if total != (MatchRun{Scored: 3, Failed: 1, Total: 4, Error: "boom"}) {
		t.Fatalf("total = %+v", total)
	}
}
