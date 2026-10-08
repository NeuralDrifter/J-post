// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

package main

import (
	"slices"
	"strconv"
	"strings"
)

// The mock interview choices. The setup dialog reads them via
// ListInterviewOptions; the brief and scoring prompt use the unexported fields.

type InterviewKind struct {
	ID    string `json:"id"`
	Label string `json:"label"`
	// briefName is how prompts name this interview, e.g. "technical (a verbal talk-through, no live coding)".
	briefName string
	// interviewer is who conducts it, e.g. "a senior engineer on the team".
	interviewer string
}

type InterviewPersona struct {
	ID          string `json:"id"`
	Label       string `json:"label"`
	Description string `json:"description"` // shown under the choice
	// briefStyle tells the interviewer how to behave.
	briefStyle string
}

type InterviewOptions struct {
	Kinds    []InterviewKind    `json:"kinds"`
	Personas []InterviewPersona `json:"personas"`
	Minutes  []int              `json:"minutes"`
}

var interviewOptions = InterviewOptions{
	Kinds: []InterviewKind{
		{ID: "phone_screen", Label: "Phone screen", briefName: "phone screen", interviewer: "a recruiter"},
		{ID: "behavioral", Label: "Behavioral", briefName: "behavioral", interviewer: "a team lead on the hiring team"},
		{ID: "technical", Label: "Technical (talk-through)", briefName: "technical (a verbal talk-through, no live coding)", interviewer: "a senior engineer on the team"},
		{ID: "hiring_manager", Label: "Hiring manager", briefName: "hiring manager", interviewer: "the hiring manager"},
		{ID: "final_round", Label: "Final round", briefName: "final round", interviewer: "a director"},
	},
	Personas: []InterviewPersona{
		{ID: "friendly", Label: "Friendly", Description: "Warm and encouraging", briefStyle: "warm and encouraging, but still realistic"},
		{ID: "neutral", Label: "Neutral", Description: "Professional, like most real interviews", briefStyle: "professional and neutral"},
		{ID: "tough", Label: "Tough", Description: "Probes vague answers and pushes back", briefStyle: "demanding: probe vague answers, ask pointed follow-ups and push back on weak reasoning"},
	},
	Minutes: []int{10, 25, 45},
}

func findInterviewKind(id string) (InterviewKind, bool) {
	i := slices.IndexFunc(interviewOptions.Kinds, func(k InterviewKind) bool { return k.ID == id })
	if i < 0 {
		return InterviewKind{}, false
	}
	return interviewOptions.Kinds[i], true
}

func findInterviewPersona(id string) (InterviewPersona, bool) {
	i := slices.IndexFunc(interviewOptions.Personas, func(p InterviewPersona) bool { return p.ID == id })
	if i < 0 {
		return InterviewPersona{}, false
	}
	return interviewOptions.Personas[i], true
}

// minutesChoices reads like "10, 25 or 45".
func minutesChoices() string {
	parts := make([]string, len(interviewOptions.Minutes))
	for i, m := range interviewOptions.Minutes {
		parts[i] = strconv.Itoa(m)
	}
	if len(parts) < 2 {
		return strings.Join(parts, "")
	}
	return strings.Join(parts[:len(parts)-1], ", ") + " or " + parts[len(parts)-1]
}
