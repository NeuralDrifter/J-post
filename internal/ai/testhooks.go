// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

package ai

// SetTestAnthropic points the Anthropic provider at url, with no retries,
// until the test ends. Only tests call it, mostly through package aitest.
func SetTestAnthropic(t interface{ Cleanup(func()) }, url string) {
	oldURL, oldRetries := anthropicBaseURL, anthropicMaxRetries
	anthropicBaseURL, anthropicMaxRetries = url, 0
	t.Cleanup(func() { anthropicBaseURL, anthropicMaxRetries = oldURL, oldRetries })
}

// SetTestClaudeCodeTempRoot makes Claude Code runs create their temp folders
// under root until the test ends, so the test can check they're cleaned up.
func SetTestClaudeCodeTempRoot(t interface{ Cleanup(func()) }, root string) {
	old := claudeCodeTempRoot
	claudeCodeTempRoot = root
	t.Cleanup(func() { claudeCodeTempRoot = old })
}
