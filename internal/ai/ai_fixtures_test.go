// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

package ai

// Test tasks for the AI layer's own tests. They copy the shape of the app's
// nudge and scorecard tasks, so provider tests don't depend on the interview
// code; the interview tests cover the real tasks.

// testNudge is testNudgeTask's result.
type testNudge struct {
	Nudge string `json:"nudge"`
	Kind  string `json:"kind"`
}

var testNudgeSchema = map[string]any{
	"type": "object",
	"properties": map[string]any{
		"nudge": map[string]any{"type": "string"},
		"kind":  map[string]any{"type": "string", "enum": []string{"tip", "good"}},
	},
	"required":             []string{"nudge", "kind"},
	"additionalProperties": false,
}

const testNudgeInstruction = "Give ONE short coaching cue about the candidate's last answer (kind: tip or good). No preamble."

// testNudgeTask is a small tips-role task, like the app's coaching nudge.
func testNudgeTask(question, answer string) Task {
	return Task{
		Name:        "nudge",
		Instruction: testNudgeInstruction,
		Input:       "Interviewer asked: " + question + "\nCandidate answered: " + answer,
		Schema:      testNudgeSchema,
		Role:        RoleTips,
	}
}

// testGradingSchema has an optional field (note), so like the scorecard it
// can't use OpenAI's strict mode.
var testGradingSchema = map[string]any{
	"type": "object",
	"properties": map[string]any{
		"summary": map[string]any{"type": "string"},
		"score":   map[string]any{"type": "integer"},
		"note":    map[string]any{"type": "string"},
	},
	"required":             []string{"summary", "score"},
	"additionalProperties": false,
}

// testGradingTask is a grading-role task, like the app's scorecard.
func testGradingTask() Task {
	return Task{
		Name:        "grading",
		Instruction: "Grade the candidate's answer.",
		Input:       "Candidate answered: We rolled back and added an index.",
		Schema:      testGradingSchema,
		Role:        RoleGrading,
	}
}
