package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/gorilla/websocket"
)

// samplePlan is a valid plan with n questions and one resume claim.
func samplePlan(n int) InterviewPlan {
	p := InterviewPlan{ResumeClaims: []ResumeClaim{{Claim: "Cut deploy time 60%", Probe: "What was the baseline?"}}}
	for i := range n {
		p.Questions = append(p.Questions, PlannedQuestion{
			Question:     fmt.Sprintf("Question %d?", i+1),
			Tests:        fmt.Sprintf("skill %d", i+1),
			Minutes:      4,
			Probes:       []string{fmt.Sprintf("Probe %d-a", i+1), fmt.Sprintf("Probe %d-b", i+1)},
			StrongAnswer: []string{fmt.Sprintf("Point %d-a", i+1), fmt.Sprintf("Point %d-b", i+1)},
		})
	}
	return p
}

func samplePlanJSON(n int) string {
	raw, _ := json.Marshal(samplePlan(n))
	return string(raw)
}

func samplePlanArgs(n int) map[string]any {
	var m map[string]any
	json.Unmarshal([]byte(samplePlanJSON(n)), &m)
	return m
}

func TestPlanQuestionCount(t *testing.T) {
	for minutes, want := range map[int]int{10: 2, 15: 3, 25: 5, 45: 9} {
		if got := planQuestionCount(minutes); got != want {
			t.Errorf("planQuestionCount(%d) = %d, want %d", minutes, got, want)
		}
	}
}

func TestPlanTaskInput(t *testing.T) {
	job := Job{Company: "Acme", Position: "Staff Engineer", Description: "Build APIs"}
	task := planTask(job, "Jane, Go", InterviewSetup{Kind: "behavioral", Minutes: 25, Persona: "tough", Focus: "conflict"})
	if task.name != "interviewPlan" || task.role != rolePlanning {
		t.Fatalf("task = %q / %v", task.name, task.role)
	}
	persona, _ := findInterviewPersona("tough")
	for _, want := range []string{"Build APIs", "Jane, Go", kindBriefName("behavioral"), "25 minutes", "conflict", "5 core questions", persona.briefStyle, "Acme", "Staff Engineer"} {
		if !strings.Contains(task.input, want) {
			t.Errorf("input missing %q:\n%s", want, task.input)
		}
	}
	if !strings.Contains(planTask(job, "", InterviewSetup{Kind: "behavioral", Minutes: 25, Persona: "tough"}).input, "no resume provided") {
		t.Error("an empty resume should be called out")
	}
}

func TestPlanValidate(t *testing.T) {
	noProbes := samplePlan(5)
	noProbes.Questions[2].Probes = nil
	noPoints := samplePlan(5)
	noPoints.Questions[1].StrongAnswer = []string{}
	blank := samplePlan(5)
	blank.Questions[0].Question = "  "
	for _, tc := range []struct {
		name string
		plan InterviewPlan
		ok   bool
	}{
		{"five", samplePlan(5), true},
		{"four", samplePlan(4), true},
		{"six", samplePlan(6), true},
		{"three", samplePlan(3), false},
		{"none", samplePlan(0), false},
		{"no probes", noProbes, false},
		{"no strong points", noPoints, false},
		{"blank question", blank, false},
	} {
		err := tc.plan.validate(25)
		if (err == nil) != tc.ok {
			t.Errorf("%s: err = %v", tc.name, err)
		}
	}
	if err := samplePlan(1).validate(25); err == nil || !strings.Contains(err.Error(), "expected about 5") {
		t.Errorf("count error should say what was expected: %v", err)
	}
}

func TestPlanningRoleLimits(t *testing.T) {
	if claudeCodeTimeout[rolePlanning] != 3*time.Minute || anthropicTimeout[rolePlanning] != 2*time.Minute || anthropicMaxTokens[rolePlanning] != 16000 {
		t.Fatalf("claude code %v, anthropic %v / %d", claudeCodeTimeout[rolePlanning], anthropicTimeout[rolePlanning], anthropicMaxTokens[rolePlanning])
	}
}

var planJob = Job{Company: "Acme", Position: "Staff Engineer", Description: "Build APIs"}
var planSetup = InterviewSetup{Kind: "behavioral", Minutes: 25, Persona: "tough"}

func TestPlanThroughGeminiLive(t *testing.T) {
	fakeLiveServer(t, func(c *websocket.Conn, setup map[string]any) {
		replyWithToolCall(t, samplePlanArgs(5), nil)(c, setup)
	})
	var p InterviewPlan
	s := Settings{GeminiKey: "k", GeminiLiveModel: "gemini-3.8-live"}
	if _, err := runAITask(context.Background(), s, providerGeminiLive, planTask(planJob, "cv", planSetup), &p); err != nil || p.validate(25) != nil {
		t.Fatalf("p = %+v, err = %v", p, err)
	}
}

func TestPlanThroughAnthropic(t *testing.T) {
	var body map[string]any
	fakeAnthropic(t, func(w http.ResponseWriter, r *http.Request) {
		json.NewDecoder(r.Body).Decode(&body)
		w.Header().Set("Content-Type", "application/json")
		w.Write(anthropicReply("claude-opus-5-5", samplePlanJSON(5), "end_turn"))
	})
	var p InterviewPlan
	if _, err := runAITask(context.Background(), anthropicSettings, providerAnthropic, planTask(planJob, "cv", planSetup), &p); err != nil || p.validate(25) != nil {
		t.Fatalf("p = %+v, err = %v", p, err)
	}
	if body["output_config"].(map[string]any)["effort"] != anthropicSettings.AnthropicGradingEffort || body["max_tokens"] != float64(16000) {
		t.Fatalf("planning should use grading effort and budget: %v", body)
	}
}

func TestPlanThroughClaudeCode(t *testing.T) {
	s, root := useFakeClaude(t, "plan")
	var p InterviewPlan
	if _, err := runAITask(context.Background(), s, providerClaudeCode, planTask(planJob, "cv", planSetup), &p); err != nil || p.validate(25) != nil {
		t.Fatalf("p = %+v, err = %v", p, err)
	}
	assertEmptyDir(t, root)
}

func TestBriefHasDepthRules(t *testing.T) {
	brief := buildInterviewBrief(planJob, nil, "cv", testSetup, nil)
	for _, want := range []string{"personally", "numbers", "baseline", "rehearsed", "One topic at a time"} {
		if !strings.Contains(brief, want) {
			t.Errorf("brief is missing the depth rule about %q", want)
		}
	}
}

func TestBriefWithPlan(t *testing.T) {
	plan := samplePlan(2)
	brief := buildInterviewBrief(planJob, nil, "cv", testSetup, &plan)
	for _, want := range []string{"Your interview plan", "Probe 1-a", "Probe 2-b", "Point 1-a", "Point 2-b", "skill 1",
		"Cut deploy time 60%", "What was the baseline?", "4 min", "Cover every core question"} {
		if !strings.Contains(brief, want) {
			t.Errorf("brief is missing %q", want)
		}
	}
	if q1, q2 := strings.Index(brief, "Question 1?"), strings.Index(brief, "Question 2?"); q1 < 0 || q2 < q1 {
		t.Errorf("questions missing or out of order: %d, %d", q1, q2)
	}
	if !strings.Contains(brief, "Never read") || !strings.Contains(brief, "never hint") {
		t.Error("the brief must tell the interviewer never to read out or hint at the plan")
	}
	if strings.Index(brief, "Your interview plan") > strings.Index(brief, "Job description:") {
		t.Error("the plan belongs before the job description")
	}
}

func TestBriefWithoutPlanHasNoPlanSection(t *testing.T) {
	if strings.Contains(buildInterviewBrief(planJob, nil, "cv", testSetup, nil), "Your interview plan") {
		t.Fatal("no plan, no plan section")
	}
}

func TestWrapUpCueMentionsPlan(t *testing.T) {
	with, without := liveCues(25, true), liveCues(25, false)
	if !strings.Contains(with.WrapUp, "core question") || strings.Contains(without.WrapUp, "core question") {
		t.Fatalf("with = %q, without = %q", with.WrapUp, without.WrapUp)
	}
	with.WrapUp = without.WrapUp
	if with != without {
		t.Fatalf("only the wrap-up note should differ: %+v vs %+v", with, without)
	}
	if !strings.HasSuffix(liveCues(25, true).WrapUp, "]") {
		t.Error("the note must stay in square brackets")
	}
}

// tokenServer fakes the Live token endpoint, recording each locked brief.
func tokenServer(t *testing.T) *[]string {
	t.Helper()
	briefs := &[]string{}
	withGeminiServer(t, func(w http.ResponseWriter, req *http.Request) {
		var body map[string]any
		json.NewDecoder(req.Body).Decode(&body)
		setup := body["bidiGenerateContentSetup"].(map[string]any)
		*briefs = append(*briefs, setup["systemInstruction"].(map[string]any)["parts"].([]any)[0].(map[string]any)["text"].(string))
		w.Write([]byte(`{"name":"auth_tokens/t1"}`))
	})
	return briefs
}

// noLivePlanning fails the test if a Live socket is opened.
func noLivePlanning(t *testing.T) {
	fakeLiveServer(t, func(c *websocket.Conn, setup map[string]any) {
		t.Error("no Live planning call expected")
	})
}

// anthropicPlanner fakes the Anthropic API answering with body (status 200) or failing with status.
func anthropicPlanner(t *testing.T, status int, body string) *int {
	calls := new(int)
	fakeAnthropic(t, func(w http.ResponseWriter, r *http.Request) {
		*calls++
		w.Header().Set("Content-Type", "application/json")
		if status != http.StatusOK {
			w.WriteHeader(status)
			w.Write([]byte(`{"type":"error","error":{"type":"api_error","message":"boom"}}`))
			return
		}
		w.Write(anthropicReply("claude-opus-5-5", body, "end_turn"))
	})
	return calls
}

func planSettings() Settings {
	s := anthropicSettings
	s.GeminiKey, s.GeminiLiveModel = "k", "gemini-3.8-live"
	return s
}

func TestPrepareInterviewMakesPlanWithSettingProvider(t *testing.T) {
	r := newTestRepo(t)
	j := interviewJob(t, r)
	briefs := tokenServer(t)
	noLivePlanning(t)
	anthropicPlanner(t, http.StatusOK, samplePlanJSON(5))
	s := planSettings()
	s.PlanProvider = providerAnthropic
	live, err := prepareInterview(context.Background(), r, s, j.ID, testSetup)
	if err != nil {
		t.Fatal(err)
	}
	mi, err := r.GetMockInterview(live.SessionID)
	if err != nil || mi.Plan == nil || mi.Plan.Provider != providerAnthropic || mi.Plan.Model != "claude-opus-5-5" || mi.Attempt != 1 {
		t.Fatalf("mi = %+v, err = %v", mi, err)
	}
	if len(*briefs) != 1 || !strings.Contains((*briefs)[0], "Question 1?") || live.Cues != liveCues(25, true) {
		t.Fatalf("briefs = %d, cues = %+v", len(*briefs), live.Cues)
	}
}

func TestPrepareInterviewPlanProviderOverride(t *testing.T) {
	r := newTestRepo(t)
	j := interviewJob(t, r)
	tokenServer(t)
	noLivePlanning(t)
	calls := anthropicPlanner(t, http.StatusOK, samplePlanJSON(5))
	s := planSettings()
	s.PlanProvider = providerGeminiLive
	setup := testSetup
	setup.PlanProvider = providerAnthropic
	if _, err := prepareInterview(context.Background(), r, s, j.ID, setup); err != nil || *calls != 1 {
		t.Fatalf("err = %v, anthropic calls = %d", err, *calls)
	}
}

func TestPrepareInterviewPlanFailureCreatesNothing(t *testing.T) {
	r := newTestRepo(t)
	j := interviewJob(t, r)
	briefs := tokenServer(t)
	anthropicPlanner(t, http.StatusInternalServerError, "")
	s := planSettings()
	s.PlanProvider = providerAnthropic
	if _, err := prepareInterview(context.Background(), r, s, j.ID, testSetup); err == nil {
		t.Fatal("expected the planning error")
	}
	if list, _ := r.ListAllMockInterviews(); len(list) != 0 || countRows(t, r, "interview_plans") != 0 || len(*briefs) != 0 {
		t.Fatalf("left behind: %d interviews, %d plans, %d tokens", len(list), countRows(t, r, "interview_plans"), len(*briefs))
	}
}

func TestPrepareInterviewInvalidPlanFails(t *testing.T) {
	r := newTestRepo(t)
	j := interviewJob(t, r)
	tokenServer(t)
	anthropicPlanner(t, http.StatusOK, samplePlanJSON(1))
	s := planSettings()
	s.PlanProvider = providerAnthropic
	_, err := prepareInterview(context.Background(), r, s, j.ID, testSetup)
	if err == nil || !strings.Contains(err.Error(), "expected about 5") {
		t.Fatalf("err = %v", err)
	}
	if list, _ := r.ListAllMockInterviews(); len(list) != 0 {
		t.Fatalf("no interview should be created: %d", len(list))
	}
}

func TestPrepareInterviewTokenFailureCreatesNothing(t *testing.T) {
	r := newTestRepo(t)
	j := interviewJob(t, r)
	withGeminiServer(t, func(w http.ResponseWriter, req *http.Request) { w.WriteHeader(http.StatusBadRequest) })
	anthropicPlanner(t, http.StatusOK, samplePlanJSON(5))
	s := planSettings()
	s.PlanProvider = providerAnthropic
	if _, err := prepareInterview(context.Background(), r, s, j.ID, testSetup); err == nil {
		t.Fatal("expected the token error")
	}
	if list, _ := r.ListAllMockInterviews(); len(list) != 0 || countRows(t, r, "interview_plans") != 0 {
		t.Fatalf("left behind: %d interviews, %d plans", len(list), countRows(t, r, "interview_plans"))
	}
}

func TestPrepareInterviewWithoutPlan(t *testing.T) {
	r := newTestRepo(t)
	j := interviewJob(t, r)
	briefs := tokenServer(t)
	noLivePlanning(t)
	calls := anthropicPlanner(t, http.StatusOK, samplePlanJSON(5))
	s := planSettings()
	s.PlanProvider = providerAnthropic
	setup := testSetup
	setup.PlanProvider = planNone
	live, err := prepareInterview(context.Background(), r, s, j.ID, setup)
	if err != nil || *calls != 0 {
		t.Fatalf("err = %v, calls = %d", err, *calls)
	}
	mi, _ := r.GetMockInterview(live.SessionID)
	if mi.Plan != nil || strings.Contains((*briefs)[0], "Your interview plan") || live.Cues != liveCues(25, false) {
		t.Fatalf("mi = %+v", mi)
	}
}

// plannedOriginal starts an interview planned by the Anthropic fake (which is
// then gone) and returns it.
func plannedOriginal(t *testing.T, r *Repo, j Job) MockInterview {
	t.Helper()
	s := planSettings()
	s.PlanProvider = providerAnthropic
	live, err := prepareInterview(context.Background(), r, s, j.ID, testSetup)
	if err != nil {
		t.Fatal(err)
	}
	mi, _ := r.GetMockInterview(live.SessionID)
	return mi
}

func TestRetryReusesPlanAndOriginalShape(t *testing.T) {
	r := newTestRepo(t)
	j := interviewJob(t, r)
	briefs := tokenServer(t)
	calls := anthropicPlanner(t, http.StatusOK, samplePlanJSON(5))
	original := plannedOriginal(t, r, j)
	noLivePlanning(t)
	setNow(r, 2026, time.October, 2, 12)
	retry := InterviewSetup{RetryOf: original.ID, Kind: "technical", Minutes: 45, Persona: "friendly", Voice: "Puck", PlanProvider: providerGeminiLive}
	s := planSettings()
	s.PlanProvider = providerAnthropic
	live, err := prepareInterview(context.Background(), r, s, j.ID, retry)
	if err != nil || *calls != 1 {
		t.Fatalf("err = %v, planning calls = %d (want only the original's)", err, *calls)
	}
	mi, _ := r.GetMockInterview(live.SessionID)
	if mi.PlanID != original.PlanID || mi.Kind != "behavioral" || mi.Minutes != 25 || mi.Persona != "friendly" || mi.Attempt != 2 {
		t.Fatalf("retry = %+v", mi)
	}
	if !strings.Contains((*briefs)[1], "Question 1?") || live.Cues != liveCues(25, true) {
		t.Fatalf("the retry's brief should carry the same plan; cues = %+v", live.Cues)
	}
}

func TestRetryWithoutPlanIsRefused(t *testing.T) {
	r := newTestRepo(t)
	j := interviewJob(t, r)
	tokenServer(t)
	setup := testSetup
	setup.PlanProvider = planNone
	live, err := prepareInterview(context.Background(), r, planSettings(), j.ID, setup)
	if err != nil {
		t.Fatal(err)
	}
	_, err = prepareInterview(context.Background(), r, planSettings(), j.ID, InterviewSetup{RetryOf: live.SessionID, Persona: "neutral"})
	if !errors.Is(err, errNoPlanToRetry) {
		t.Fatalf("err = %v", err)
	}
	if list, _ := r.ListAllMockInterviews(); len(list) != 1 {
		t.Fatalf("the refused retry created an interview: %d", len(list))
	}
}

func TestRetryOfMissingInterview(t *testing.T) {
	r := newTestRepo(t)
	j := interviewJob(t, r)
	tokenServer(t)
	_, err := prepareInterview(context.Background(), r, planSettings(), j.ID, InterviewSetup{RetryOf: "nope", Persona: "neutral"})
	if !errors.Is(err, ErrNotFound) {
		t.Fatalf("err = %v", err)
	}
}

func plannedForGrading() MockInterview {
	plan := samplePlan(2)
	return MockInterview{Kind: "behavioral", Persona: "tough", Transcript: sampleTranscript,
		Plan: &InterviewPlanRecord{ID: "p1", Provider: providerClaudeCode, Plan: plan}}
}

func TestScoringPromptIncludesPlan(t *testing.T) {
	prompt := scoringPrompt(planJob, plannedForGrading(), "cv")
	for _, want := range []string{"Question plan", "[0] Question 1?", "[1] Question 2?", "Point 1-a", "Point 2-b", "Cut deploy time 60%"} {
		if !strings.Contains(prompt, want) {
			t.Errorf("prompt is missing %q:\n%s", want, prompt)
		}
	}
	if strings.Index(prompt, "Question plan") > strings.Index(prompt, "Transcript:") {
		t.Error("the plan belongs before the transcript")
	}
}

func TestScoringPromptWithoutPlan(t *testing.T) {
	if strings.Contains(scoringPrompt(planJob, MockInterview{Kind: "behavioral", Transcript: sampleTranscript}, "cv"), "Question plan") {
		t.Fatal("no plan, no plan section")
	}
}

func TestScoringInstructionCoversPlan(t *testing.T) {
	for _, want := range []string{"strong answer", "planIndex", "not the candidate's"} {
		if !strings.Contains(scoringInstruction, want) {
			t.Errorf("scoring instruction is missing %q", want)
		}
	}
}

func TestPlanIndexRoundTrips(t *testing.T) {
	var c Scorecard
	if err := json.Unmarshal([]byte(`{"questions":[{"question":"a","planIndex":0},{"question":"b"}]}`), &c); err != nil {
		t.Fatal(err)
	}
	if c.Questions[0].PlanIndex == nil || *c.Questions[0].PlanIndex != 0 || c.Questions[1].PlanIndex != nil {
		t.Fatalf("questions = %+v", c.Questions)
	}
	raw, _ := json.Marshal(c.Questions[1])
	if strings.Contains(string(raw), "planIndex") {
		t.Fatalf("an off-plan question should omit planIndex: %s", raw)
	}
}

func TestScorecardSchemaPlanIndexIsOptionalInteger(t *testing.T) {
	items := scorecardSchema["properties"].(map[string]any)["questions"].(map[string]any)["items"].(map[string]any)
	if items["properties"].(map[string]any)["planIndex"].(map[string]any)["type"] != "integer" {
		t.Fatalf("planIndex = %v", items["properties"].(map[string]any)["planIndex"])
	}
	for _, r := range items["required"].([]string) {
		if r == "planIndex" {
			t.Fatal("planIndex must stay optional so older scorecards stay valid")
		}
	}
	g := geminiSchema(scorecardSchema)["properties"].(map[string]any)["questions"].(map[string]any)["items"].(map[string]any)
	if g["properties"].(map[string]any)["planIndex"].(map[string]any)["type"] != "INTEGER" {
		t.Fatal("Gemini's dialect needs INTEGER")
	}
}

func TestPlanTaskNamesTheInterviewer(t *testing.T) {
	screen, _ := findInterviewKind("phone_screen")
	task := planTask(planJob, "cv", InterviewSetup{Kind: "phone_screen", Minutes: 10, Persona: "neutral"})
	if !strings.Contains(task.input, screen.interviewer) {
		t.Errorf("the planner should know who runs the interview (%q):\n%s", screen.interviewer, task.input)
	}
	if strings.Contains(task.instruction, "hiring manager") {
		t.Error("the instruction should not fix the role; a phone screen is run by a recruiter")
	}
}
