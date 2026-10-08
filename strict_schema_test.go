package main

import (
	"context"
	"testing"
)

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
		if got := strictCompatible(c.schema); got != c.want {
			t.Errorf("%s: strictCompatible = %v, want %v", name, got, c.want)
		}
	}
}

func TestOpenAIJSONSchemaNotStrictWithOptionalFields(t *testing.T) {
	f, srv := newFakeOpenAI(t, chatReply("m1", `{}`))
	p, _ := providerByID(providerOpenAICompatible)
	p.run(context.Background(), customSettings(srv, modeJSONSchema), scorecardTask(Job{Company: "Acme"}, MockInterview{}, ""))
	rf, _ := f.bodies[0]["response_format"].(map[string]any)
	js, _ := rf["json_schema"].(map[string]any)
	if rf["type"] != "json_schema" || js["schema"] == nil || js["strict"] == true {
		t.Fatalf("response_format = %v; want the schema sent without strict", rf)
	}
}
