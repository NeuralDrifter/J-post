package main

import (
	"fmt"
	"strings"
)

// A question plan is written by an AI provider before a mock interview. It
// steers the Live interviewer (see buildInterviewBrief) and is the checklist
// the interview is graded against. Retries reuse it.

type PlannedQuestion struct {
	Question     string   `json:"question"`
	Tests        string   `json:"tests"`   // what the question tests
	Minutes      int      `json:"minutes"` // rough time budget
	Probes       []string `json:"probes"`
	StrongAnswer []string `json:"strongAnswer"` // points a strong answer covers
}

type ResumeClaim struct {
	Claim string `json:"claim"`
	Probe string `json:"probe"` // how to test it
}

type InterviewPlan struct {
	Questions    []PlannedQuestion `json:"questions"`
	ResumeClaims []ResumeClaim     `json:"resumeClaims"`
}

// planQuestionCount is about one core question per five minutes, at least two.
func planQuestionCount(minutes int) int {
	return max(2, minutes/5)
}

var planSchema = func() map[string]any {
	str := map[string]any{"type": "string"}
	strs := map[string]any{"type": "array", "items": str}
	questionFields := []string{"question", "tests", "minutes", "probes", "strongAnswer"}
	claimFields := []string{"claim", "probe"}
	return map[string]any{
		"type": "object",
		"properties": map[string]any{
			"questions": map[string]any{"type": "array", "items": map[string]any{
				"type": "object",
				"properties": map[string]any{
					"question": str, "tests": str, "minutes": map[string]any{"type": "integer"},
					"probes": strs, "strongAnswer": strs,
				},
				"required": questionFields, "additionalProperties": false,
			}},
			"resumeClaims": map[string]any{"type": "array", "items": map[string]any{
				"type":       "object",
				"properties": map[string]any{"claim": str, "probe": str},
				"required":   claimFields, "additionalProperties": false,
			}},
		},
		"required":             []string{"questions", "resumeClaims"},
		"additionalProperties": false,
	}
}()

const planInstruction = "You are an experienced hiring manager preparing your private notes for a realistic interview. " +
	"Write exactly the requested number of core questions, grounded in the job description and the candidate's resume, " +
	"in the order a real interview of this kind would flow. For each question give: what it tests; a time budget in " +
	"minutes (the budgets should add up to about the interview length minus 3 minutes for the greeting and wrap-up); " +
	"2-3 follow-up probes that dig into the candidate's personal contribution, the trade-offs they made and measurable " +
	"results; and 3-5 concrete points a strong answer would cover. Then list 2-4 specific claims from the resume worth " +
	"testing, each with a probe that would show whether it holds up (an empty list when there is no resume). " +
	"Ask questions a sharp interviewer at this company would really ask, not generic ones."

// planTask asks for the question plan of a mock interview. s must already be validated.
func planTask(job Job, resume string, s InterviewSetup) aiTask {
	persona, _ := findInterviewPersona(s.Persona)
	var b strings.Builder
	fmt.Fprintf(&b, "Interview: a %d minutes %s interview for the %s role at %s.\n", s.Minutes, kindBriefName(s.Kind), job.Position, job.Company)
	fmt.Fprintf(&b, "Interviewer style: %s (%s).\n", s.Persona, persona.briefStyle)
	fmt.Fprintf(&b, "Write %d core questions.\n", planQuestionCount(s.Minutes))
	if s.Focus != "" {
		fmt.Fprintf(&b, "The candidate wants to practice: %s. Make sure the plan covers it.\n", s.Focus)
	}
	fmt.Fprintf(&b, "\nJob description:\n%s\n", orDefault(job.Description, "(not provided)"))
	fmt.Fprintf(&b, "\nCandidate's resume:\n%s\n", orDefault(resume, "(no resume provided)"))
	return aiTask{
		name:        "interviewPlan",
		instruction: planInstruction,
		input:       b.String(),
		schema:      planSchema,
		role:        rolePlanning,
	}
}

// validate checks what the schema can't: the question count for the interview
// length, and that every question has probes and strong-answer points.
func (p InterviewPlan) validate(minutes int) error {
	want := planQuestionCount(minutes)
	if n := len(p.Questions); n == 0 || n < want-1 || n > want+1 {
		return fmt.Errorf("the plan has %d questions; expected about %d", n, want)
	}
	for i, q := range p.Questions {
		switch {
		case strings.TrimSpace(q.Question) == "":
			return fmt.Errorf("plan question %d is empty", i+1)
		case len(q.Probes) == 0:
			return fmt.Errorf("plan question %d has no follow-up probes", i+1)
		case len(q.StrongAnswer) == 0:
			return fmt.Errorf("plan question %d says nothing about a strong answer", i+1)
		}
	}
	return nil
}
