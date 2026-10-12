// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

package app

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"sync/atomic"
	"testing"

	"jobtrack/internal/ai/aitest"
	"jobtrack/internal/settings"
)

// requestedIDs finds the posting IDs in an Anthropic request body: the task's
// input is the text of the first user message.
func requestedIDs(t *testing.T, body []byte) []string {
	t.Helper()
	var req struct {
		Messages []struct {
			Content []struct {
				Text string `json:"text"`
			} `json:"content"`
		} `json:"messages"`
	}
	if err := json.Unmarshal(body, &req); err != nil || len(req.Messages) == 0 || len(req.Messages[0].Content) == 0 {
		t.Fatalf("unexpected request: %s", body)
	}
	var in struct {
		Postings []struct {
			ID string `json:"id"`
		} `json:"postings"`
	}
	json.Unmarshal([]byte(req.Messages[0].Content[0].Text), &in)
	var ids []string
	for _, p := range in.Postings {
		ids = append(ids, p.ID)
	}
	return ids
}

// matchReply is an Anthropic answer scoring each ID 80 on resume fit only.
func matchReply(ids []string) []byte {
	var results []string
	for _, id := range ids {
		results = append(results, fmt.Sprintf(`{"id":%q,"resumeFit":{"score":80,"note":"good"},"seniority":{"applicable":false,"score":0,"note":"no target"},`+
			`"location":{"applicable":false,"score":0,"note":"no preference"},"salary":{"applicable":false,"score":0,"note":"no floor"},"strengths":["Go"],"gaps":[]}`, id))
	}
	return aitest.AnthropicReply("claude-opus-5-5", `{"results":[`+strings.Join(results, ",")+`]}`, "end_turn")
}

func matchSettings(perRequest int) settings.Settings {
	s := aitest.AnthropicSettings
	s.MatchPerRequest = perRequest
	return aitest.WithTask(s, settings.TaskJobMatch, settings.ProviderAnthropic)
}

type progressLog struct{ calls []string }

func (l *progressLog) report(done, total int) {
	l.calls = append(l.calls, fmt.Sprintf("%d/%d", done, total))
}

func TestRunMatchScoresInGroups(t *testing.T) {
	r := newTestRepo(t)
	ps := addPostings(t, r, "A", "B", "C", "D", "E")
	var requests atomic.Int32
	aitest.FakeAnthropic(t, func(w http.ResponseWriter, req *http.Request) {
		requests.Add(1)
		body, _ := io.ReadAll(req.Body)
		w.Header().Set("Content-Type", "application/json")
		w.Write(matchReply(requestedIDs(t, body)))
	})
	var log progressLog
	s := matchSettings(2)
	run, err := runMatch(context.Background(), r, s, matchResume{ID: "r1", Text: "Jane Doe, Go"}, ps, log.report)
	if err != nil || run.Scored != 5 || run.Failed != 0 || run.Total != 5 || run.Error != "" {
		t.Fatalf("run = %+v, %v", run, err)
	}
	if requests.Load() != 3 || strings.Join(log.calls, " ") != "2/5 4/5 5/5" {
		t.Fatalf("requests = %d, progress = %v", requests.Load(), log.calls)
	}
	got, _ := r.GetPosting(ps[4].ID)
	if got.Match == nil || got.Match.Overall != 80 || got.Match.Provider != settings.ProviderAnthropic || got.Match.Model != "claude-opus-5-5" ||
		got.Match.fingerprint != matchFingerprint("Jane Doe, Go", s) || got.Match.ResumeID != "r1" {
		t.Fatalf("match = %+v", got.Match)
	}
}

func TestRunMatchStopsAtFailedRequest(t *testing.T) {
	r := newTestRepo(t)
	ps := addPostings(t, r, "A", "B", "C", "D", "E")
	var requests atomic.Int32
	aitest.FakeAnthropic(t, func(w http.ResponseWriter, req *http.Request) {
		body, _ := io.ReadAll(req.Body)
		w.Header().Set("Content-Type", "application/json")
		if requests.Add(1) == 2 {
			w.WriteHeader(http.StatusUnauthorized)
			w.Write([]byte(`{"type":"error","error":{"type":"authentication_error","message":"invalid x-api-key"}}`))
			return
		}
		w.Write(matchReply(requestedIDs(t, body)))
	})
	run, err := runMatch(context.Background(), r, matchSettings(2), matchResume{Text: "Jane Doe"}, ps, func(int, int) {})
	if err != nil || run.Scored != 2 || run.Failed != 2 || run.Total != 5 || !strings.HasPrefix(run.Error, "Scoring stopped: ") || !strings.Contains(run.Error, "API key") {
		t.Fatalf("run = %+v, %v", run, err)
	}
	if requests.Load() != 2 {
		t.Fatalf("requests = %d: the run must stop at the first failure", requests.Load())
	}
}

func TestRunMatchPartialAnswer(t *testing.T) {
	r := newTestRepo(t)
	ps := addPostings(t, r, "A", "B")
	aitest.FakeAnthropic(t, func(w http.ResponseWriter, req *http.Request) {
		body, _ := io.ReadAll(req.Body)
		w.Header().Set("Content-Type", "application/json")
		w.Write(matchReply(requestedIDs(t, body)[:1]))
	})
	run, err := runMatch(context.Background(), r, matchSettings(5), matchResume{Text: "Jane Doe"}, ps, func(int, int) {})
	if err != nil || run.Scored != 1 || run.Failed != 1 || run.Error != "" {
		t.Fatalf("run = %+v, %v", run, err)
	}
}

func TestRunMatchSkipsPostingDeletedMidRun(t *testing.T) {
	r := newTestRepo(t)
	ps := addPostings(t, r, "A", "B")
	aitest.FakeAnthropic(t, func(w http.ResponseWriter, req *http.Request) {
		body, _ := io.ReadAll(req.Body)
		r.db.Exec(`DELETE FROM postings WHERE id = ?`, ps[0].ID) // e.g. "Clear older than 90 days" meanwhile
		w.Header().Set("Content-Type", "application/json")
		w.Write(matchReply(requestedIDs(t, body)))
	})
	run, err := runMatch(context.Background(), r, matchSettings(5), matchResume{Text: "Jane Doe"}, ps, func(int, int) {})
	if err != nil || run.Error != "" {
		t.Fatalf("run = %+v, %v", run, err)
	}
	if got, _ := r.GetPosting(ps[1].ID); got.Match == nil {
		t.Fatal("the other posting should still be scored")
	}
}

func TestRunMatchSafeguards(t *testing.T) {
	r := newTestRepo(t)
	ps := addPostings(t, r, "A")
	var requests atomic.Int32
	aitest.FakeAnthropic(t, func(w http.ResponseWriter, req *http.Request) { requests.Add(1) })

	run, _ := runMatch(context.Background(), r, matchSettings(5), matchResume{Text: "Jane"}, nil, func(int, int) {})
	if run.Total != 0 || run.Error != "" {
		t.Fatalf("nothing to score: %+v", run)
	}
	run, _ = runMatch(context.Background(), r, matchSettings(5), matchResume{Text: "  \n\t "}, ps, func(int, int) {})
	if run.Error != "Add your resume on the Profile page to get match scores" {
		t.Fatalf("blank resume: %+v", run)
	}
	noKey := matchSettings(5)
	noKey.AnthropicKey = ""
	run, _ = runMatch(context.Background(), r, noKey, matchResume{Text: "Jane"}, ps, func(int, int) {})
	if !strings.HasPrefix(run.Error, "Job matching: ") || !strings.Contains(run.Error, "Anthropic") {
		t.Fatalf("provider not set up: %+v", run)
	}
	if requests.Load() != 0 {
		t.Fatalf("safeguards must send no request, sent %d", requests.Load())
	}
}

func TestMatchCandidates(t *testing.T) {
	r := newTestRepo(t)
	ps := addPostings(t, r, "A", "B", "C")
	r.saveMatchScore(ps[0].ID, sampleScore(70), "fp")
	if err := r.DismissPosting(ps[1].ID); err != nil {
		t.Fatal(err)
	}
	got, err := r.matchCandidates(func(p Posting) bool { return p.Match == nil })
	if err != nil || len(got) != 1 || got[0].ID != ps[2].ID {
		t.Fatalf("got %v, %v (scored and dismissed postings are skipped)", got, err)
	}
}

func TestScoreInboxOneRunAtATime(t *testing.T) {
	a := newTestApp(t)
	a.matchMu.Lock()
	defer a.matchMu.Unlock()
	run, err := a.ScoreInbox()
	if err != nil || run.Error != "Scoring is already running" {
		t.Fatalf("run = %+v, %v", run, err)
	}
}
