// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

package app

import (
	"testing"

	"jobtrack/internal/settings"
)

func TestChoiceFor(t *testing.T) {
	s := settings.Settings{AIFeatures: map[string]settings.AIChoice{
		settings.TaskInterviewPlan: {Provider: settings.ProviderAnthropic, Model: "claude-sonnet-5-5", Effort: "max"},
	}}
	if got := choiceFor(s, settings.TaskInterviewPlan, ""); got != s.AIFeatures[settings.TaskInterviewPlan] {
		t.Fatalf("no override: %+v", got)
	}
	if got := choiceFor(s, settings.TaskInterviewPlan, settings.ProviderAnthropic); got.Model != "claude-sonnet-5-5" {
		t.Fatalf("same provider keeps the setting's model: %+v", got)
	}
	// The setting's model belongs to its provider, so another provider runs on its own model.
	if got := choiceFor(s, settings.TaskInterviewPlan, settings.ProviderDeepSeek); got != (settings.AIChoice{Provider: settings.ProviderDeepSeek, Effort: "max"}) {
		t.Fatalf("other provider: %+v", got)
	}
}
