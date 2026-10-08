// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

package main

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func card(summary string, communication int) Scorecard {
	return Scorecard{Overall: ScoreSet{Communication: communication, Structure: 3, Relevance: 3, Depth: 3, Confidence: 3},
		Summary: summary, Questions: []QuestionReview{}, PracticeNext: []string{"a", "b", "c"}}
}

func newMock(t *testing.T, r *Repo) MockInterview {
	t.Helper()
	mi, err := r.CreateMockInterview(interviewJob(t, r).ID, testSetup, "")
	if err != nil {
		t.Fatal(err)
	}
	return mi
}

func TestMigration8MovesScorecards(t *testing.T) {
	path := filepath.Join(t.TempDir(), "jobtrack.db")
	db, err := openDBWith(path, migrations[:7])
	if err != nil {
		t.Fatal(err)
	}
	// Build the version-7 data with plain SQL: today's code already expects migration 8.
	job, err := NewRepo(db, t.TempDir()).CreateJob(Job{Company: "Acme", Position: "Dev"})
	if err != nil {
		db.Close()
		t.Fatal(err)
	}
	const id = "mock1"
	_, err = db.Exec(`INSERT INTO mock_interviews (id, job_id, kind, minutes, persona, status, started_at, ended_at, scorecard)
		VALUES (?, ?, 'behavioral', 25, 'neutral', 'done', '2026-10-01T12:00:00.000Z', '2026-10-01T12:25:00.000Z', ?)`, id, job.ID,
		`{"overall":{"communication":4,"structure":3,"relevance":3,"depth":3,"confidence":3},"summary":"Solid.","questions":[],"practiceNext":["a","b","c"]}`)
	db.Close()
	if err != nil {
		t.Fatal(err)
	}
	mi := MockInterview{ID: id}

	db, err = openDB(path)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	r := NewRepo(db, t.TempDir())
	got, err := r.GetMockInterview(mi.ID)
	if err != nil {
		t.Fatal(err)
	}
	if len(got.Scorecards) != 1 || got.Scorecards[0].Provider != providerGeminiLive || got.Scorecards[0].Scorecard.Summary != "Solid." ||
		got.Scorecard == nil || got.Scorecard.Overall.Communication != 4 {
		t.Fatalf("got = %+v", got)
	}
	if _, err := db.Exec(`SELECT scorecard FROM mock_interviews`); err == nil {
		t.Fatal("the old scorecard column should be gone")
	}
}

func TestScorecardUpsertPerProvider(t *testing.T) {
	r := newTestRepo(t)
	mi := newMock(t, r)
	if err := r.saveScorecard(mi.ID, providerGeminiLive, "gemini-3.8-live", card("gemini", 3)); err != nil {
		t.Fatal(err)
	}
	setNow(r, 2026, time.October, 2, 9)
	if err := r.saveScorecard(mi.ID, providerAnthropic, "claude-opus-5-5", card("claude", 4)); err != nil {
		t.Fatal(err)
	}
	got, _ := r.GetMockInterview(mi.ID)
	if len(got.Scorecards) != 2 || got.Scorecards[0].Provider != providerAnthropic || got.Scorecard.Summary != "claude" {
		t.Fatalf("newest first, newest is the headline card: %+v", got.Scorecards)
	}
	setNow(r, 2026, time.October, 3, 9)
	if err := r.saveScorecard(mi.ID, providerAnthropic, "claude-opus-5-5", card("claude again", 5)); err != nil {
		t.Fatal(err)
	}
	got, _ = r.GetMockInterview(mi.ID)
	if len(got.Scorecards) != 2 || got.Scorecards[0].Scorecard.Summary != "claude again" || got.Scorecards[0].Model != "claude-opus-5-5" {
		t.Fatalf("re-grading with the same provider replaces its card: %+v", got.Scorecards)
	}
}

func TestDeleteScorecardLastOneUnscores(t *testing.T) {
	r := newTestRepo(t)
	mi := newMock(t, r)
	r.saveScorecard(mi.ID, providerGeminiLive, "m", card("a", 3))
	r.saveScorecard(mi.ID, providerAnthropic, "m", card("b", 3))
	if err := r.DeleteScorecard(mi.ID, providerGeminiLive); err != nil {
		t.Fatal(err)
	}
	if got, _ := r.GetMockInterview(mi.ID); len(got.Scorecards) != 1 || got.Status == MockUnscored {
		t.Fatalf("one card left: %+v", got)
	}
	if err := r.DeleteScorecard(mi.ID, providerAnthropic); err != nil {
		t.Fatal(err)
	}
	got, _ := r.GetMockInterview(mi.ID)
	if len(got.Scorecards) != 0 || got.Scorecard != nil || got.Status != MockUnscored {
		t.Fatalf("no cards left should mean unscored: %+v", got)
	}
	if err := r.DeleteScorecard(mi.ID, providerAnthropic); err == nil {
		t.Fatal("deleting a card that doesn't exist should fail")
	}
}

func TestTipsSavedAndCascade(t *testing.T) {
	r := newTestRepo(t)
	mi := newMock(t, r)
	r.saveTip(mi.ID, InterviewTip{AnswerAtMs: 9000, Kind: "good", Text: "Clear outcome", Provider: providerGeminiLive, Model: "m"})
	r.saveTip(mi.ID, InterviewTip{AnswerAtMs: 4000, Kind: "tip", Text: "Lead with the result", Provider: providerGeminiLive, Model: "m"})
	got, _ := r.GetMockInterview(mi.ID)
	if len(got.Tips) != 2 || got.Tips[0].AnswerAtMs != 4000 || got.Tips[1].Text != "Clear outcome" {
		t.Fatalf("tips in answer order: %+v", got.Tips)
	}
	if err := r.DeleteMockInterview(mi.ID); err != nil {
		t.Fatal(err)
	}
	var n int
	r.db.QueryRow(`SELECT COUNT(*) FROM interview_tips`).Scan(&n)
	if n != 0 {
		t.Fatalf("tips should go with their interview, %d left", n)
	}
}

func TestDeleteRecordingWhenFileMissing(t *testing.T) {
	r := newTestRepo(t)
	mi := newMock(t, r)
	rec := filepath.Join(t.TempDir(), "rec.webm")
	os.WriteFile(rec, []byte("webm"), 0o644)
	r.SetInterviewRecording(mi.ID, rec)
	if err := r.DeleteInterviewRecording(mi.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(rec); !os.IsNotExist(err) {
		t.Fatal("the recording file should be deleted")
	}
	// Already gone (deleted twice, or removed outside the app): still fine.
	r.SetInterviewRecording(mi.ID, rec)
	if err := r.DeleteInterviewRecording(mi.ID); err != nil {
		t.Fatalf("a missing file must not be an error: %v", err)
	}
	if got, _ := r.GetMockInterview(mi.ID); got.HasRecording {
		t.Fatal("the recording should be cleared")
	}
}

func TestListAllMockInterviews(t *testing.T) {
	r := newTestRepo(t)
	first := newMock(t, r)
	r.saveScorecard(first.ID, providerGeminiLive, "m", card("a", 2))
	r.saveScorecard(first.ID, providerClaudeCode, "m", card("b", 4))
	r.saveTip(first.ID, InterviewTip{AnswerAtMs: 1, Kind: "tip", Text: "x", Provider: providerGeminiLive})
	setNow(r, 2026, time.October, 5, 9)
	other, err := r.CreateJob(Job{Company: "Globex", Position: "Analyst"})
	if err != nil {
		t.Fatal(err)
	}
	second, err := r.CreateMockInterview(other.ID, testSetup, "")
	if err != nil {
		t.Fatal(err)
	}
	list, err := r.ListAllMockInterviews()
	if err != nil {
		t.Fatal(err)
	}
	if len(list) != 2 || list[0].ID != second.ID || list[0].Company != "Globex" || list[0].LatestOverall != nil || list[0].HasTips {
		t.Fatalf("newest first, unscored has no score: %+v", list)
	}
	f := list[1]
	if strings.Join(f.Graders, ",") != "claude-code,gemini-live" || f.LatestOverall == nil || f.LatestOverall.Communication != 4 || !f.HasTips || f.HasRecording {
		t.Fatalf("first = %+v", f)
	}
}

func TestRecordingFileMissingOnDiskIsTreatedAsNoRecording(t *testing.T) {
	r := newTestRepo(t)
	mi := newMock(t, r)
	r.SetInterviewRecording(mi.ID, filepath.Join(t.TempDir(), "gone.webm")) // deleted outside the app
	data, err := r.recordingData(mi.ID)
	if err != nil || data != nil {
		t.Fatalf("a missing file should read as no recording, not an error: %v", err)
	}
	if got, _ := r.GetMockInterview(mi.ID); got.HasRecording {
		t.Fatal("the stale recording path should be cleared so the page and list stop showing it")
	}
	rec := filepath.Join(t.TempDir(), "rec.webm")
	os.WriteFile(rec, []byte("webm"), 0o644)
	r.SetInterviewRecording(mi.ID, rec)
	if data, err := r.recordingData(mi.ID); err != nil || string(data) != "webm" {
		t.Fatalf("data = %q, err = %v", data, err)
	}
}
