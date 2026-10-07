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
