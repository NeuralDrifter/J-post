// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

package app

import (
	"cmp"
	"context"
	"errors"
	"fmt"
	"strings"

	"jobtrack/internal/ai"
	"jobtrack/internal/settings"
	"jobtrack/internal/textproc"
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

const planInstruction = "You are the interviewer described below, preparing your private notes for a realistic interview. " +
	"Ask what someone in your role would really ask in this kind of interview, at the depth that role goes to. " +
	"Write exactly the requested number of core questions, grounded in the job description and the candidate's resume, " +
	"in the order a real interview of this kind would flow. For each question give: what it tests; a time budget in " +
	"minutes (the budgets should add up to about the interview length minus 3 minutes for the greeting and wrap-up); " +
	"2-3 follow-up probes that dig into the candidate's personal contribution, the trade-offs they made and measurable " +
	"results; and 3-5 concrete points a strong answer would cover. Then list 2-4 specific claims from the resume worth " +
	"testing, each with a probe that would show whether it holds up (an empty list when there is no resume). " +
	"Ask questions a sharp interviewer at this company would really ask, not generic ones."

// planTask asks for the question plan of a mock interview. s must already be validated.
func planTask(job Job, resume string, s InterviewSetup) ai.Task {
	persona, _ := findInterviewPersona(s.Persona)
	kind, _ := findInterviewKind(s.Kind)
	var b strings.Builder
	fmt.Fprintf(&b, "Interview: a %d minutes %s interview for the %s role at %s.\n", s.Minutes, kindBriefName(s.Kind), job.Position, job.Company)
	fmt.Fprintf(&b, "You are %s.\n", textproc.OrDefault(kind.interviewer, "the interviewer"))

	fmt.Fprintf(&b, "Interviewer style: %s (%s).\n", s.Persona, persona.briefStyle)
	fmt.Fprintf(&b, "Write %d core questions.\n", planQuestionCount(s.Minutes))
	if s.Focus != "" {
		fmt.Fprintf(&b, "The candidate wants to practice: %s. Make sure the plan covers it.\n", s.Focus)
	}
	fmt.Fprintf(&b, "\nJob description:\n%s\n", textproc.OrDefault(job.Description, "(not provided)"))
	fmt.Fprintf(&b, "\nCandidate's resume:\n%s\n", textproc.OrDefault(resume, "(no resume provided)"))
	return ai.Task{
		Name:        "interviewPlan",
		Instruction: planInstruction,
		Input:       b.String(),
		Schema:      planSchema,
		Role:        ai.RolePlanning,
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

// briefSection is the plan as the interviewer's private notes, for the brief.
func (p InterviewPlan) briefSection() string {
	var b strings.Builder
	b.WriteString(`Your interview plan (private notes):
- Cover every core question below, in order. Put each one in your own words, as you naturally would, rather than reading it out.
- Follow up on what the candidate actually said before moving on. Use the probes when the answer doesn't already cover them, adapted to their answer.
- Use "a strong answer covers" to decide what to probe for. Never read it out and never hint at it.
- Keep to each question's time budget; when you're well over it, move on to the next question.
- Work the resume claims in where they fit naturally.

`)
	for i, q := range p.Questions {
		fmt.Fprintf(&b, "%d. %s (about %d min; tests %s)\n", i+1, q.Question, q.Minutes, q.Tests)
		fmt.Fprintf(&b, "   Probes: %s\n", strings.Join(q.Probes, " | "))
		fmt.Fprintf(&b, "   A strong answer covers: %s\n", strings.Join(q.StrongAnswer, "; "))
	}
	if len(p.ResumeClaims) > 0 {
		b.WriteString("\nResume claims to verify:\n")
		for _, c := range p.ResumeClaims {
			fmt.Fprintf(&b, "- %s: %s\n", c.Claim, c.Probe)
		}
	}
	return b.String()
}

// planNone as InterviewSetup.PlanProvider starts the interview without a plan.
const planNone = "none"

var errNoPlanToRetry = errors.New("This interview has no question plan to retry.")

// interviewPlanFor returns the plan for a new interview: reused when retrying,
// nil for planNone, otherwise written by the chosen provider (the setup's
// override, else the setting) and checked. A new plan has no ID yet.
func interviewPlanFor(ctx context.Context, s settings.Settings, job Job, resume string, setup InterviewSetup, reused *InterviewPlanRecord) (*InterviewPlanRecord, error) {
	if reused != nil {
		return reused, nil
	}
	provider := cmp.Or(setup.PlanProvider, s.PlanProvider)
	if provider == planNone {
		return nil, nil
	}
	var p InterviewPlan
	model, err := ai.RunTask(ctx, s, provider, planTask(job, resume, setup), &p)
	if err != nil {
		return nil, fmt.Errorf("couldn't prepare the questions: %w", err)
	}
	if err := p.validate(setup.Minutes); err != nil {
		return nil, fmt.Errorf("couldn't prepare the questions: %w", err)
	}
	return &InterviewPlanRecord{Provider: provider, Model: model, Plan: p}, nil
}

// gradingSection is the plan for the grader, numbered by planIndex.
func (p InterviewPlan) gradingSection() string {
	var b strings.Builder
	b.WriteString("Question plan the interviewer was given (planIndex in brackets):\n")
	for i, q := range p.Questions {
		fmt.Fprintf(&b, "[%d] %s (tests %s)\n    A strong answer covers: %s\n", i, q.Question, q.Tests, strings.Join(q.StrongAnswer, "; "))
	}
	if len(p.ResumeClaims) > 0 {
		b.WriteString("Resume claims to verify:\n")
		for _, c := range p.ResumeClaims {
			fmt.Fprintf(&b, "- %s\n", c.Claim)
		}
	}
	return b.String()
}
