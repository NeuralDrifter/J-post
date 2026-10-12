// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

package app

import "jobtrack/internal/settings"

// choiceFor is who runs task: the setting, or, when the user picked another
// provider for this one run, that provider on its own model with the task's effort.
func choiceFor(s settings.Settings, task, provider string) settings.AIChoice {
	c := s.AIChoice(task)
	if provider == "" || provider == c.Provider {
		return c
	}
	return settings.AIChoice{Provider: provider, Effort: c.Effort}
}
