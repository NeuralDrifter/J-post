// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

package settings

import (
	"fmt"
	"maps"
	"slices"
	"strings"
)

// Every AI job in the app is a task listed here once. Settings keeps one
// AIChoice per task; the Settings page groups them by AITaskGroup.

// AIChoice is who runs a task: a provider, optionally one of its models
// (empty = the provider's own model setting) and an effort (Anthropic only).
type AIChoice struct {
	Provider string `json:"provider"`
	Model    string `json:"model"`
	Effort   string `json:"effort"`
}

type AITask struct {
	ID, Group, Label string
	DefaultEffort    string
}

type AITaskGroup struct {
	ID, Label string
}

const (
	TaskInterviewPlan    = "interviewPlan"
	TaskInterviewTips    = "interviewTips"
	TaskInterviewGrading = "interviewGrading"
	TaskJobMatch         = "jobMatch"
	TaskResumeTailor     = "resumeTailor"
	TaskResumeImprove    = "resumeImprove"
	TaskResumeReview     = "resumeReview"
	TaskResumeImport     = "resumeImport"
	TaskLetterDraft      = "letterDraft"
)

const (
	effortQuick    = "low"
	effortThorough = "high"
)

var AITaskGroups = []AITaskGroup{
	{"interviews", "Mock interviews"},
	{"matching", "Job matching"},
	{"resumes", "Resumes"},
	{"letters", "Cover letters"},
}

var AITasks = []AITask{
	{TaskInterviewPlan, "interviews", "Question plan (before interviews)", effortThorough},
	{TaskInterviewTips, "interviews", "Coaching tips (during interviews)", effortQuick},
	{TaskInterviewGrading, "interviews", "Grading (scorecards)", effortThorough},
	{TaskJobMatch, "matching", "Discover match scores", effortThorough},
	{TaskResumeTailor, "resumes", "Tailor to a job", effortThorough},
	{TaskResumeImprove, "resumes", "Improve a line", effortQuick},
	{TaskResumeReview, "resumes", "Writing review", effortThorough},
	{TaskResumeImport, "resumes", "Tidy an import", effortThorough},
	{TaskLetterDraft, "letters", "Draft a letter", effortThorough},
}

const defaultTaskProvider = ProviderGeminiLive

// AIChoice is the provider, model and effort chosen for a task.
func (s Settings) AIChoice(task string) AIChoice {
	return s.AIFeatures[task]
}

// applyAIFeatureDefaults gives every task a provider and effort, and drops
// tasks this build doesn't know (left over from an older settings file).
func (s *Settings) applyAIFeatureDefaults() {
	features := make(map[string]AIChoice, len(AITasks))
	for _, task := range AITasks {
		c := s.AIFeatures[task.ID]
		c.Provider = strings.TrimSpace(c.Provider)
		if c.Provider == "" {
			c.Provider = defaultTaskProvider
		}
		c.Model = strings.TrimSpace(c.Model)
		if c.Effort == "" {
			c.Effort = task.DefaultEffort
		}
		features[task.ID] = c
	}
	s.AIFeatures = features
}

func (s Settings) validateAIFeatures() error {
	for _, id := range slices.Sorted(maps.Keys(s.AIFeatures)) {
		c := s.AIFeatures[id]
		if !slices.Contains(AIProviderIDs, c.Provider) {
			return fmt.Errorf("unknown AI provider %q", c.Provider)
		}
		if !slices.Contains(AnthropicEfforts, c.Effort) {
			return fmt.Errorf("effort must be one of %s", strings.Join(AnthropicEfforts, ", "))
		}
	}
	return nil
}
