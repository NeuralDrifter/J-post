package main

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

var testSetup = InterviewSetup{Kind: "behavioral", Minutes: 25, Persona: "tough", Voice: "Puck", InterviewerName: "Dana Reyes", Focus: "conflict stories"}

func interviewJob(t *testing.T, r *Repo) Job {
	return mustCreate(t, r, Job{Company: "Acme", Position: "Staff Engineer", Status: StatusInterviewing,
		Description: "Lead the payments platform team.", Notes: "Recruiter said they value ownership."})
}

func TestBriefContents(t *testing.T) {
	job := Job{Company: "Acme", Position: "Staff Engineer", Description: "Lead payments.", Notes: "Values ownership."}
	brief := buildInterviewBrief(job, []Contact{{Name: "Maya", Role: "Hiring manager"}}, "# Jane\n- Built billing at Brex", testSetup)
	for _, want := range []string{"Acme", "Staff Engineer", "behavioral", "25 minutes", "tough", "conflict stories",
		"Lead payments.", "Values ownership.", "Built billing at Brex", "Hiring manager", "one question at a time", "Dana Reyes"} {
		if !strings.Contains(brief, want) {
			t.Errorf("brief is missing %q", want)
		}
	}
	if strings.Contains(brief, "you may play") {
		t.Error("contacts are background only; the interviewer has a fixed name")
	}
}

func TestBriefWithoutResume(t *testing.T) {
	brief := buildInterviewBrief(Job{Company: "Acme", Position: "Dev"}, nil, "  ", testSetup)
	if !strings.Contains(brief, "No resume was provided") {
		t.Fatal("the brief should say there's no resume")
	}
}

func TestInterviewSetupValidation(t *testing.T) {
	bad := []InterviewSetup{
		{Kind: "pottery", Minutes: 25, Persona: "neutral"},
		{Kind: "behavioral", Minutes: 7, Persona: "neutral"},
		{Kind: "behavioral", Minutes: 25, Persona: "evil"},
		{Kind: "behavioral", Minutes: 25, Persona: "neutral", Voice: "Robot"},
	}
	for i, s := range bad {
		if err := validateInterviewSetup(&s); err == nil {
			t.Errorf("case %d should fail", i)
		}
	}
	ok := InterviewSetup{Kind: "phone_screen", Minutes: 10, Persona: "friendly"}
	if err := validateInterviewSetup(&ok); err != nil || ok.Voice == "" {
		t.Fatalf("ok = %+v, %v", ok, err)
	}
}

func TestPrepareInterviewNoKey(t *testing.T) {
	r := newTestRepo(t)
	j := interviewJob(t, r)
	if _, err := prepareInterview(context.Background(), r, Settings{GeminiLiveModel: "gemini-3.8-live"}, j.ID, testSetup); !errors.Is(err, errNoGeminiKey) {
		t.Fatalf("err = %v", err)
	}
}

func TestPrepareInterview(t *testing.T) {
	r := newTestRepo(t)
	j := interviewJob(t, r)
	r.SaveResume("cv.md", "", "# Jane\n- Go")
	var sentSetup map[string]any
	withGeminiServer(t, func(w http.ResponseWriter, req *http.Request) {
		var body map[string]any
		json.NewDecoder(req.Body).Decode(&body)
		sentSetup = body["bidiGenerateContentSetup"].(map[string]any)
		w.Write([]byte(`{"name":"auth_tokens/t1"}`))
	})
	s := Settings{GeminiKey: "k", GeminiLiveModel: "gemini-3.8-live"}
	live, err := prepareInterview(context.Background(), r, s, j.ID, testSetup)
	if err != nil {
		t.Fatal(err)
	}
	if live.Token != "auth_tokens/t1" || !strings.HasPrefix(live.WSURL, "wss://") || live.SessionID == "" || live.Company != "Acme" || live.Kind != "behavioral" {
		t.Fatalf("live = %+v", live)
	}
	if sentSetup["model"] != "models/gemini-3.8-live" {
		t.Fatalf("setup = %v", sentSetup)
	}
	voice := sentSetup["generationConfig"].(map[string]any)["speechConfig"].(map[string]any)["voiceConfig"].(map[string]any)["prebuiltVoiceConfig"].(map[string]any)["voiceName"]
	brief := sentSetup["systemInstruction"].(map[string]any)["parts"].([]any)[0].(map[string]any)["text"].(string)
	if voice != "Puck" || !strings.Contains(brief, "Jane") {
		t.Fatalf("voice=%v brief has resume=%v", voice, strings.Contains(brief, "Jane"))
	}
	for _, k := range []string{"inputAudioTranscription", "outputAudioTranscription", "contextWindowCompression"} {
		if _, ok := sentSetup[k]; !ok {
			t.Errorf("locked setup missing %s", k)
		}
	}
	// Resumption isn't locked into the token; the page sends it so it can reconnect with a handle.
	if _, ok := sentSetup["sessionResumption"]; ok {
		t.Error("sessionResumption must not be in the token's locked setup")
	}
	if _, ok := live.Setup["sessionResumption"]; !ok {
		t.Error("the page's setup needs sessionResumption")
	}
	mi, err := r.GetMockInterview(live.SessionID)
	if err != nil || mi.Status != "live" || mi.Kind != "behavioral" || mi.Company != "Acme" || mi.InterviewerName != "Dana Reyes" || live.InterviewerName != "Dana Reyes" {
		t.Fatalf("stored = %+v, %v", mi, err)
	}
}

var sampleTranscript = []TranscriptLine{
	{Speaker: "interviewer", Text: "Tell me about a conflict with a teammate.", AtMs: 0},
	{Speaker: "you", Text: "At Brex we disagreed about a migration; I set up a design review and we shipped it two weeks early.", AtMs: 4000},
}

func TestScoreInterview(t *testing.T) {
	r := newTestRepo(t)
	j := interviewJob(t, r)
	mi, _ := r.CreateMockInterview(j.ID, testSetup)
	if err := r.SaveInterviewTranscript(mi.ID, sampleTranscript); err != nil {
		t.Fatal(err)
	}
	withGeminiServer(t, func(w http.ResponseWriter, req *http.Request) {
		card := `{"overall":{"communication":4,"structure":9,"relevance":4,"depth":3,"confidence":0},"summary":"Solid.",
			"questions":[{"question":"Conflict","answerSummary":"Design review","worked":"Clear outcome","improve":"Say your role","strongerAnswer":"..."}],
			"practiceNext":["Quantify impact","Name your role","Pause before answering"]}`
		resp, _ := json.Marshal(map[string]any{"candidates": []any{map[string]any{"content": map[string]any{"parts": []any{map[string]any{"text": card}}}}}})
		w.Write(resp)
	})
	done, err := scoreInterview(context.Background(), r, Settings{GeminiKey: "k", GeminiTextModel: "m"}, mi.ID)
	if err != nil || done.Status != "done" || done.Scorecard == nil {
		t.Fatalf("done = %+v, %v", done, err)
	}
	if o := done.Scorecard.Overall; o.Structure != 5 || o.Confidence != 1 || o.Communication != 4 {
		t.Fatalf("scores should be clamped to 1-5: %+v", o)
	}
	if len(done.Scorecard.Questions) != 1 || len(done.Scorecard.PracticeNext) != 3 || done.EndedAt == "" {
		t.Fatalf("scorecard = %+v", done.Scorecard)
	}
}

func TestScoreInterviewFailureKeepsTranscript(t *testing.T) {
	r := newTestRepo(t)
	j := interviewJob(t, r)
	mi, _ := r.CreateMockInterview(j.ID, testSetup)
	r.SaveInterviewTranscript(mi.ID, sampleTranscript)
	withGeminiServer(t, func(w http.ResponseWriter, req *http.Request) {
		http.Error(w, "overloaded", http.StatusServiceUnavailable)
	})
	failed, err := scoreInterview(context.Background(), r, Settings{GeminiKey: "k", GeminiTextModel: "m"}, mi.ID)
	if err == nil || failed.Status != "failed" || failed.Error == "" || len(failed.Transcript) != 2 {
		t.Fatalf("failed = %+v, %v", failed, err)
	}
	empty, _ := r.CreateMockInterview(j.ID, testSetup)
	if res, err := scoreInterview(context.Background(), r, Settings{GeminiKey: "k", GeminiTextModel: "m"}, empty.ID); err == nil || res.Status != "failed" {
		t.Fatalf("an empty transcript can't be scored: %+v %v", res, err)
	}
}

func TestInterviewStorage(t *testing.T) {
	r := newTestRepo(t)
	j := interviewJob(t, r)
	mi, err := r.CreateMockInterview(j.ID, testSetup)
	if err != nil {
		t.Fatal(err)
	}
	rec := filepath.Join(t.TempDir(), "rec.webm")
	os.WriteFile(rec, []byte("webm"), 0o644)
	if err := r.SetInterviewRecording(mi.ID, rec); err != nil {
		t.Fatal(err)
	}
	r.SaveInterviewTranscript(mi.ID, sampleTranscript)
	list, _ := r.ListMockInterviews(j.ID)
	if len(list) != 1 || !list[0].HasRecording || len(list[0].Transcript) != 2 {
		t.Fatalf("list = %+v", list)
	}
	if err := r.DeleteMockInterview(mi.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(rec); !errors.Is(err, os.ErrNotExist) {
		t.Fatal("deleting the session should remove its recording")
	}
	other, _ := r.CreateMockInterview(j.ID, testSetup)
	r.DeleteJob(j.ID)
	if _, err := r.GetMockInterview(other.ID); !errors.Is(err, ErrNotFound) {
		t.Fatalf("job delete should cascade: %v", err)
	}
}

func TestMockInterviewStatusTransitions(t *testing.T) {
	r := newTestRepo(t)
	mi, err := r.CreateMockInterview(interviewJob(t, r).ID, testSetup)
	if err != nil {
		t.Fatal(err)
	}
	get := func() MockInterview {
		t.Helper()
		m, err := r.GetMockInterview(mi.ID)
		if err != nil {
			t.Fatal(err)
		}
		return m
	}

	if err := r.markFailed(mi.ID, errors.New("model busy")); err != nil {
		t.Fatal(err)
	}
	failed := get()
	if failed.Status != MockFailed || failed.Error != "model busy" || failed.EndedAt == "" {
		t.Fatalf("failed = %+v", failed)
	}

	setNow(r, 2026, time.October, 2, 9)
	if err := r.markScoring(mi.ID); err != nil {
		t.Fatal(err)
	}
	scoring := get()
	if scoring.Status != MockScoring || scoring.Error != "" || scoring.EndedAt != failed.EndedAt {
		t.Fatalf("scoring = %+v (ended_at must not move)", scoring)
	}

	if err := r.markDone(mi.ID, Scorecard{Summary: "solid"}); err != nil {
		t.Fatal(err)
	}
	if done := get(); done.Status != MockDone || done.Scorecard == nil || done.Scorecard.Summary != "solid" {
		t.Fatalf("done = %+v", done)
	}

	if err := r.markFailed(mi.ID, errors.New("retry failed")); err != nil {
		t.Fatal(err)
	}
	if again := get(); again.Scorecard == nil || again.Scorecard.Summary != "solid" {
		t.Fatalf("a later failure must keep the earlier scorecard: %+v", again)
	}
}
