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

	"github.com/gorilla/websocket"
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
	if live.Token != "auth_tokens/t1" || !strings.HasPrefix(live.WSURL, "wss://") || live.SessionID == "" || live.Company != "Acme" || live.Kind != "behavioral" || live.Cues != liveCues(25) {
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
	var card map[string]any
	json.Unmarshal([]byte(`{"overall":{"communication":4,"structure":9,"relevance":4,"depth":3,"confidence":0},"summary":"Solid.",
		"questions":[{"question":"Conflict","answerSummary":"Design review","worked":"Clear outcome","improve":"Say your role","strongerAnswer":"..."}],
		"practiceNext":["Quantify impact","Name your role","Pause before answering"]}`), &card)
	var prompt string
	fakeLiveServer(t, replyWithToolCall(t, card, &prompt))
	done, err := scoreInterview(context.Background(), r, Settings{GeminiKey: "k", GeminiLiveModel: "m"}, mi.ID)
	if err != nil || done.Status != "done" || done.Scorecard == nil {
		t.Fatalf("done = %+v, %v", done, err)
	}
	if o := done.Scorecard.Overall; o.Structure != 5 || o.Confidence != 1 || o.Communication != 4 {
		t.Fatalf("scores should be clamped to 1-5: %+v", o)
	}
	if len(done.Scorecard.Questions) != 1 || len(done.Scorecard.PracticeNext) != 3 || done.EndedAt == "" {
		t.Fatalf("scorecard = %+v", done.Scorecard)
	}
	if !strings.Contains(prompt, "Transcript:") {
		t.Fatalf("the scoring prompt should carry the transcript: %q", prompt)
	}
}

func TestScoreInterviewFailureKeepsTranscript(t *testing.T) {
	r := newTestRepo(t)
	j := interviewJob(t, r)
	mi, _ := r.CreateMockInterview(j.ID, testSetup)
	r.SaveInterviewTranscript(mi.ID, sampleTranscript)
	fakeLiveServer(t, func(c *websocket.Conn, setup map[string]any) {
		c.WriteMessage(websocket.CloseMessage, websocket.FormatCloseMessage(1011, "model overloaded"))
	})
	failed, err := scoreInterview(context.Background(), r, Settings{GeminiKey: "k", GeminiLiveModel: "m"}, mi.ID)
	if err == nil || failed.Status != "failed" || failed.Error == "" || len(failed.Transcript) != 2 {
		t.Fatalf("failed = %+v, %v", failed, err)
	}
	empty, _ := r.CreateMockInterview(j.ID, testSetup)
	if res, err := scoreInterview(context.Background(), r, Settings{GeminiKey: "k", GeminiLiveModel: "m"}, empty.ID); err == nil || res.Status != "failed" {
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

	if err := r.markDone(mi.ID, providerGeminiLive, "gemini-3.8-live", Scorecard{Summary: "solid"}); err != nil {
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

func TestUnreadableTranscriptIsReported(t *testing.T) {
	r := newTestRepo(t)
	mi, _ := r.CreateMockInterview(interviewJob(t, r).ID, testSetup)
	r.db.Exec(`UPDATE mock_interviews SET transcript = 'not json' WHERE id = ?`, mi.ID)
	if _, err := r.GetMockInterview(mi.ID); err == nil || !strings.Contains(err.Error(), "transcript") {
		t.Fatalf("err = %v", err)
	}
}

func TestInterviewLengthErrorListsChoices(t *testing.T) {
	s := InterviewSetup{Kind: "behavioral", Minutes: 7, Persona: "neutral"}
	if err := validateInterviewSetup(&s); err == nil || !strings.Contains(err.Error(), "10, 25 or 45") {
		t.Fatalf("err = %v", err)
	}
}

func TestLiveCuesTiming(t *testing.T) {
	short := liveCues(10)
	if short.WrapUpAtMs != 8*60_000 || short.TimeUpAtMs != 10*60_000 || !strings.Contains(short.WrapUp, "about 2 minutes") {
		t.Fatalf("10-minute cues = %+v", short)
	}
	long := liveCues(45)
	if long.WrapUpAtMs != 41*60_000 || !strings.Contains(long.WrapUp, "about 4 minutes") {
		t.Fatalf("45-minute cues = %+v", long)
	}
	for _, note := range []string{long.WrapUp, long.TimeUp} {
		if !strings.HasPrefix(note, "[") || !strings.HasSuffix(note, "]") {
			t.Errorf("timekeeper notes must be in square brackets, as the brief promises: %q", note)
		}
	}
}

func TestLiveSetupWaitsThroughThinkingPauses(t *testing.T) {
	setup := liveSetup("m", "Puck", "brief")
	vad, ok := setup["realtimeInputConfig"].(map[string]any)["automaticActivityDetection"].(map[string]any)
	if !ok {
		t.Fatalf("setup has no automaticActivityDetection: %v", setup["realtimeInputConfig"])
	}
	if vad["endOfSpeechSensitivity"] != "END_SENSITIVITY_LOW" || vad["silenceDurationMs"] != thinkingPauseMs || thinkingPauseMs < 1000 {
		t.Fatalf("vad = %v", vad)
	}
	if _, set := vad["startOfSpeechSensitivity"]; set {
		t.Error("start-of-speech detection should stay default so the candidate can still interrupt")
	}
}

func TestBriefAndScoringAllowForPauses(t *testing.T) {
	brief := buildInterviewBrief(Job{Company: "Acme", Position: "Dev"}, nil, "", testSetup)
	if !strings.Contains(brief, "pausing to think") {
		t.Error("brief should tell the interviewer to wait through pauses")
	}
	for _, want := range []string{"[cut in while the candidate paused]", "[interrupted by the candidate]", "fair to critique"} {
		if !strings.Contains(scoringInstruction, want) {
			t.Errorf("scoring instruction should explain %q", want)
		}
	}
}

func TestTranscriptTextJoinsConsecutiveTurns(t *testing.T) {
	got := transcriptText([]TranscriptLine{
		{Speaker: SpeakerInterviewer, Text: "Tell me about yourself."},
		{Speaker: SpeakerCandidate, Text: "I started in recruiting,"},
		{Speaker: SpeakerCandidate, Text: "then moved into AI leadership."},
	})
	want := "Interviewer: Tell me about yourself.\nCandidate: I started in recruiting, then moved into AI leadership.\n"
	if got != want {
		t.Fatalf("got %q", got)
	}
}

func TestTranscriptTextLabelsCutOffs(t *testing.T) {
	pauseCutIn := &CutOff{SpokeMs: 1200, GapMs: 1600}       // jumped in right after a pause, cut off at once
	realInterruption := &CutOff{SpokeMs: 6000, GapMs: 1600} // well into its question
	openingCutOff := &CutOff{SpokeMs: 1000, GapMs: -1}      // no earlier candidate words to have paused in
	got := transcriptText([]TranscriptLine{
		{Speaker: SpeakerCandidate, Text: "I started in recruiting"},
		{Speaker: SpeakerInterviewer, Text: "Great, and", CutOff: pauseCutIn},
		{Speaker: SpeakerCandidate, Text: "then moved into AI leadership."},
		{Speaker: SpeakerInterviewer, Text: "Let me ask about", CutOff: realInterruption},
		{Speaker: SpeakerCandidate, Text: "Sorry, one more thing."},
		{Speaker: SpeakerInterviewer, Text: "Hi, I'm", CutOff: openingCutOff},
	})
	for _, want := range []string{
		"Interviewer: Great, and [cut in while the candidate paused]",
		"Interviewer: Let me ask about [interrupted by the candidate]",
		"Interviewer: Hi, I'm [interrupted by the candidate]",
	} {
		if !strings.Contains(got, want) {
			t.Errorf("missing %q in: %s", want, got)
		}
	}
}

func TestLiveCuesRejoinNote(t *testing.T) {
	rejoin := liveCues(25).Rejoin
	if !strings.HasPrefix(rejoin, "(") || !strings.Contains(rejoin, "without greeting") {
		t.Fatalf("rejoin = %q", rejoin)
	}
}

// scoredInterview returns an interview with a transcript, ready to grade.
func scoredInterviewSetup(t *testing.T, r *Repo) MockInterview {
	t.Helper()
	mi, err := r.CreateMockInterview(interviewJob(t, r).ID, testSetup)
	if err != nil {
		t.Fatal(err)
	}
	if err := r.SaveInterviewTranscript(mi.ID, sampleTranscript); err != nil {
		t.Fatal(err)
	}
	return mi
}

func scorecardArgs() map[string]any {
	return map[string]any{
		"overall": map[string]any{"communication": 4, "structure": 3, "relevance": 4, "depth": 3, "confidence": 4},
		"summary": "Solid.", "questions": []any{}, "practiceNext": []any{"a", "b", "c"},
	}
}

func scorecardJSON() string {
	b, _ := json.Marshal(scorecardArgs())
	return string(b)
}

func TestScoreInterviewUsesGradingProviderAndSavesCard(t *testing.T) {
	r := newTestRepo(t)
	mi := scoredInterviewSetup(t, r)
	fakeAnthropic(t, func(w http.ResponseWriter, req *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Write(anthropicReply("claude-opus-5-5", scorecardJSON(), "end_turn"))
	})
	s := anthropicSettings
	s.GradingProvider = providerAnthropic
	done, err := scoreInterview(context.Background(), r, s, mi.ID)
	if err != nil || done.Status != MockDone || len(done.Scorecards) != 1 {
		t.Fatalf("done = %+v, err = %v", done, err)
	}
	if c := done.Scorecards[0]; c.Provider != providerAnthropic || c.Model != "claude-opus-5-5" || c.Scorecard.Summary != "Solid." {
		t.Fatalf("card = %+v", c)
	}
}

func TestRegradeAddsSecondCard(t *testing.T) {
	r := newTestRepo(t)
	mi := scoredInterviewSetup(t, r)
	fakeLiveServer(t, replyWithToolCall(t, scorecardArgs(), nil))
	s := anthropicSettings
	s.GeminiKey, s.GeminiLiveModel = "k", "gemini-3.8-live"
	if _, err := scoreInterview(context.Background(), r, s, mi.ID); err != nil {
		t.Fatal(err)
	}
	fakeAnthropic(t, func(w http.ResponseWriter, req *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Write(anthropicReply("claude-opus-5-5", scorecardJSON(), "end_turn"))
	})
	got, err := regradeInterview(context.Background(), r, s, mi.ID, providerAnthropic)
	if err != nil || len(got.Scorecards) != 2 || got.Scorecards[0].Provider != providerAnthropic || got.Status != MockDone {
		t.Fatalf("got = %+v, err = %v", got, err)
	}
}

func TestRegradeFailureKeepsStatusAndCards(t *testing.T) {
	r := newTestRepo(t)
	mi := scoredInterviewSetup(t, r)
	r.markDone(mi.ID, providerGeminiLive, "gemini-3.8-live", card("first", 3))
	fakeAnthropic(t, func(w http.ResponseWriter, req *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
		w.Write([]byte(`{"type":"error","error":{"type":"api_error","message":"boom"}}`))
	})
	got, err := regradeInterview(context.Background(), r, anthropicSettings, mi.ID, providerAnthropic)
	if err == nil {
		t.Fatal("the re-grade should report the failure")
	}
	if got.Status != MockDone || len(got.Scorecards) != 1 || got.Scorecards[0].Scorecard.Summary != "first" {
		t.Fatalf("a failed re-grade must keep the status and cards: %+v", got)
	}
}

func TestRegradeWithUnavailableProvider(t *testing.T) {
	r := newTestRepo(t)
	mi := scoredInterviewSetup(t, r)
	r.markDone(mi.ID, providerGeminiLive, "gemini-3.8-live", card("first", 3))
	calls := 0
	fakeAnthropic(t, func(w http.ResponseWriter, req *http.Request) { calls++ })
	got, err := regradeInterview(context.Background(), r, Settings{}, mi.ID, providerAnthropic)
	if err == nil || !strings.Contains(err.Error(), "Anthropic API key") || calls != 0 {
		t.Fatalf("err = %v, calls = %d", err, calls)
	}
	if got.Status != MockDone || len(got.Scorecards) != 1 {
		t.Fatalf("status and cards must be untouched: %+v", got)
	}
}

func TestNudgeSavesTip(t *testing.T) {
	r := newTestRepo(t)
	mi := scoredInterviewSetup(t, r)
	fakeLiveServer(t, replyWithToolCall(t, map[string]any{"nudge": "Lead with the result", "kind": "tip"}, nil))
	n, err := nudgeAnswer(context.Background(), r, Settings{GeminiKey: "k", GeminiLiveModel: "gemini-3.8-live"}, mi.ID, "Q?", "A long answer.", 4000)
	if err != nil || n.Nudge != "Lead with the result" {
		t.Fatalf("n = %+v, err = %v", n, err)
	}
	got, _ := r.GetMockInterview(mi.ID)
	if len(got.Tips) != 1 || got.Tips[0] != (InterviewTip{AnswerAtMs: 4000, Kind: "tip", Text: "Lead with the result", Provider: providerGeminiLive, Model: "gemini-3.8-live"}) {
		t.Fatalf("tips = %+v", got.Tips)
	}
}
