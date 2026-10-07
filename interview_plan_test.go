package main

import (
	"context"
	"encoding/json"
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
