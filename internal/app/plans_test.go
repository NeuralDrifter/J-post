// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

package app

import (
	"errors"
	"path/filepath"
	"testing"
	"time"

	"jobtrack/internal/settings"
)

func countRows(t *testing.T, r *Repo, table string) int {
	t.Helper()
	var n int
	if err := r.db.QueryRow(`SELECT COUNT(*) FROM ` + table).Scan(&n); err != nil {
		t.Fatal(err)
	}
	return n
}

// plannedAttempts saves a 5-question plan for job and creates n interviews
// with it, one day apart starting 2026-10-01.
func plannedAttempts(t *testing.T, r *Repo, job Job, n int) (string, []MockInterview) {
	t.Helper()
	planID, err := r.savePlan(job.ID, testSetup, settings.ProviderClaudeCode, "claude-opus-5-5", samplePlan(5))
	if err != nil {
		t.Fatal(err)
	}
	var list []MockInterview
	for i := range n {
		setNow(r, 2026, time.October, 1+i, 12)
		mi, err := r.CreateMockInterview(job.ID, testSetup, planID)
		if err != nil {
			t.Fatal(err)
		}
		list = append(list, mi)
	}
	return planID, list
}

func TestMigration9KeepsV8Data(t *testing.T) {
	path := filepath.Join(t.TempDir(), "jobtrack.db")
	db, err := openDBWith(path, migrations[:8])
	if err != nil {
		t.Fatal(err)
	}
	job := insertV1Job(t, db)
	_, err = db.Exec(`INSERT INTO mock_interviews (id, job_id, kind, minutes, persona, status, started_at)
		VALUES ('mock1', ?, 'behavioral', 25, 'neutral', 'done', '2026-10-01T12:00:00.000Z')`, job.ID)
	if err == nil {
		_, err = db.Exec(`INSERT INTO scorecards (id, mock_interview_id, provider, model, scorecard, created_at)
			VALUES ('c1', 'mock1', 'gemini-live', '', ?, '2026-10-01T12:30:00.000Z')`, scorecardJSON())
	}
	db.Close()
	if err != nil {
		t.Fatal(err)
	}

	db, err = openDB(path)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	r := NewRepo(db, t.TempDir())
	got, err := r.GetMockInterview("mock1")
	if err != nil {
		t.Fatal(err)
	}
	if got.PlanID != "" || got.Plan != nil || got.Attempt != 0 || len(got.Attempts) != 0 || len(got.Scorecards) != 1 {
		t.Fatalf("got = %+v", got)
	}
	list, err := r.ListAllMockInterviews()
	if err != nil || len(list) != 1 || list[0].HasPlan || list[0].Attempt != 0 {
		t.Fatalf("list = %+v, %v", list, err)
	}
}

func TestPlanStorageAndAttempts(t *testing.T) {
	r := newTestRepo(t)
	job := interviewJob(t, r)
	planID, attempts := plannedAttempts(t, r, job, 3)
	setNow(r, 2026, time.October, 9, 12)
	plain, err := r.CreateMockInterview(job.ID, testSetup, "")
	if err != nil {
		t.Fatal(err)
	}

	mid, err := r.GetMockInterview(attempts[1].ID)
	if err != nil {
		t.Fatal(err)
	}
	if mid.PlanID != planID || mid.Attempt != 2 || len(mid.Attempts) != 3 || mid.Attempts[0].ID != attempts[0].ID || mid.Attempts[2].ID != attempts[2].ID {
		t.Fatalf("mid = %+v", mid)
	}
	if mid.Plan == nil || mid.Plan.ID != planID || mid.Plan.Provider != settings.ProviderClaudeCode || mid.Plan.Model != "claude-opus-5-5" ||
		len(mid.Plan.Plan.Questions) != 5 || mid.Plan.Plan.Questions[0].Probes[0] != "Probe 1-a" || mid.Plan.CreatedAt == "" {
		t.Fatalf("plan = %+v", mid.Plan)
	}
	if plain.Attempt != 0 || plain.Plan != nil || len(plain.Attempts) != 0 {
		t.Fatalf("plain = %+v", plain)
	}

	list, err := r.ListAllMockInterviews()
	if err != nil {
		t.Fatal(err)
	}
	byID := map[string]MockInterviewSummary{}
	for _, m := range list {
		byID[m.ID] = m
	}
	for i, a := range attempts {
		if s := byID[a.ID]; !s.HasPlan || s.Attempt != i+1 {
			t.Errorf("attempt %d summary = %+v", i+1, s)
		}
	}
	if s := byID[plain.ID]; s.HasPlan || s.Attempt != 0 {
		t.Errorf("plain summary = %+v", s)
	}
}

func TestAttemptOverallUsesNewestScorecard(t *testing.T) {
	r := newTestRepo(t)
	_, attempts := plannedAttempts(t, r, interviewJob(t, r), 2)
	older := Scorecard{Overall: ScoreSet{Communication: 1}}
	newer := Scorecard{Overall: ScoreSet{Communication: 5}}
	setNow(r, 2026, time.October, 10, 12)
	r.saveScorecard(attempts[0].ID, settings.ProviderGeminiLive, "", older)
	setNow(r, 2026, time.October, 11, 12)
	r.saveScorecard(attempts[0].ID, settings.ProviderAnthropic, "", newer)
	got, err := r.GetMockInterview(attempts[1].ID)
	if err != nil {
		t.Fatal(err)
	}
	if got.Attempts[0].Overall == nil || got.Attempts[0].Overall.Communication != 5 || got.Attempts[1].Overall != nil {
		t.Fatalf("attempts = %+v", got.Attempts)
	}
}

func TestDeletingAttemptsKeepsPlanUntilLast(t *testing.T) {
	r := newTestRepo(t)
	_, attempts := plannedAttempts(t, r, interviewJob(t, r), 2)
	if err := r.DeleteMockInterview(attempts[0].ID); err != nil {
		t.Fatal(err)
	}
	if n := countRows(t, r, "interview_plans"); n != 1 {
		t.Fatalf("plan should stay while an attempt uses it: %d", n)
	}
	if err := r.DeleteMockInterview(attempts[1].ID); err != nil {
		t.Fatal(err)
	}
	if n := countRows(t, r, "interview_plans"); n != 0 {
		t.Fatalf("plan should go with its last attempt: %d", n)
	}
}

func TestDeletingJobRemovesPlans(t *testing.T) {
	r := newTestRepo(t)
	job := interviewJob(t, r)
	plannedAttempts(t, r, job, 1)
	if err := r.DeleteJob(job.ID); err != nil {
		t.Fatal(err)
	}
	if n := countRows(t, r, "interview_plans"); n != 0 {
		t.Fatalf("plans left after deleting the job: %d", n)
	}
}

func TestUnreadablePlanDoesNotBreakLoading(t *testing.T) {
	r := newTestRepo(t)
	_, attempts := plannedAttempts(t, r, interviewJob(t, r), 1)
	r.db.Exec(`UPDATE interview_plans SET plan = 'not json'`)
	got, err := r.GetMockInterview(attempts[0].ID)
	if err != nil || got.PlanError == "" || got.Plan != nil {
		t.Fatalf("got = %+v, err = %v", got, err)
	}
	if _, err := r.ListAllMockInterviews(); err != nil {
		t.Fatal(err)
	}
}

func TestPlanForInterviewWithoutPlan(t *testing.T) {
	r := newTestRepo(t)
	plain, _ := r.CreateMockInterview(interviewJob(t, r).ID, testSetup, "")
	if _, err := r.planFor(plain.ID); !errors.Is(err, ErrNotFound) {
		t.Fatalf("err = %v", err)
	}
}

func TestListPlanAttempts(t *testing.T) {
	r := newTestRepo(t)
	job := interviewJob(t, r)
	_, attempts := plannedAttempts(t, r, job, 2)
	r.saveScorecard(attempts[1].ID, settings.ProviderGeminiLive, "", Scorecard{Summary: "Second."})
	list, err := r.ListPlanAttempts(attempts[1].ID)
	if err != nil || len(list) != 2 || list[0].ID != attempts[0].ID || len(list[1].Scorecards) != 1 || list[1].Scorecards[0].Scorecard.Summary != "Second." {
		t.Fatalf("list = %+v, err = %v", list, err)
	}
	plain, _ := r.CreateMockInterview(job.ID, testSetup, "")
	if list, err := r.ListPlanAttempts(plain.ID); err != nil || len(list) != 1 || list[0].ID != plain.ID {
		t.Fatalf("planless list = %+v, err = %v", list, err)
	}
}
