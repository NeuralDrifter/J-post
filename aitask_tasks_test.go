// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

package main

import (
	"strings"
	"testing"

	"jobtrack/internal/ai"
)

// checkStandardSchema walks a JSON Schema and reports anything a provider
// other than Gemini would reject or misread.
func checkStandardSchema(t *testing.T, path string, s map[string]any) {
	t.Helper()
	typ, _ := s["type"].(string)
	if typ != strings.ToLower(typ) || typ == "" {
		t.Errorf("%s: type %q must be a lowercase JSON Schema type", path, typ)
	}
	if typ == "object" {
		if _, ok := s["required"]; !ok {
			t.Errorf("%s: object without required", path)
		}
		if s["additionalProperties"] != false {
			t.Errorf("%s: object must set additionalProperties: false", path)
		}
		props, _ := s["properties"].(map[string]any)
		for name, p := range props {
			checkStandardSchema(t, path+"."+name, p.(map[string]any))
		}
	}
	if typ == "array" {
		checkStandardSchema(t, path+"[]", s["items"].(map[string]any))
	}
}

func TestTaskSchemasAreStandardJSONSchema(t *testing.T) {
	checkStandardSchema(t, "scorecard", scorecardTask(Job{}, MockInterview{}, "").Schema)
	checkStandardSchema(t, "nudge", nudgeTask("q", "a").Schema)
	checkStandardSchema(t, "interviewPlan", planSchema)
}

// OpenAI's strict structured outputs need every property in required; the
// scorecard's planIndex is optional by design.
func TestStrictCompatible(t *testing.T) {
	cases := map[string]struct {
		schema map[string]any
		want   bool
	}{
		"nudge":         {nudgeSchema, true},
		"interviewPlan": {planSchema, true},
		"scorecard":     {scorecardSchema, false},
	}
	for name, c := range cases {
		if got := ai.StrictCompatible(c.schema); got != c.want {
			t.Errorf("%s: strictCompatible = %v, want %v", name, got, c.want)
		}
	}
}
