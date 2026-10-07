package main

import (
	"context"
	"reflect"
	"strings"
	"testing"
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
	checkStandardSchema(t, "scorecard", scorecardTask(Job{}, MockInterview{}, "").schema)
	checkStandardSchema(t, "nudge", nudgeTask("q", "a").schema)
}

func TestGeminiSchemaConversion(t *testing.T) {
	in := map[string]any{
		"type": "object",
		"properties": map[string]any{
			"a":    map[string]any{"type": "string", "enum": []string{"x", "y"}},
			"list": map[string]any{"type": "array", "items": map[string]any{"type": "integer"}},
		},
		"required":             []string{"a"},
		"additionalProperties": false,
	}
	want := map[string]any{
		"type": "OBJECT",
		"properties": map[string]any{
			"a":    map[string]any{"type": "STRING", "enum": []string{"x", "y"}},
			"list": map[string]any{"type": "ARRAY", "items": map[string]any{"type": "INTEGER"}},
		},
		"required": []string{"a"},
	}
	if got := geminiSchema(in); !reflect.DeepEqual(got, want) {
		t.Fatalf("got %#v", got)
	}
	if in["type"] != "object" {
		t.Fatal("the conversion must not modify the task's schema")
	}
}

func TestRunAITaskUnknownAndUnavailable(t *testing.T) {
	var n Nudge
	if _, err := runAITask(context.Background(), Settings{}, "nope", nudgeTask("q", "a"), &n); err == nil {
		t.Fatal("unknown provider should fail")
	}
	old := geminiLiveWSBase
	geminiLiveWSBase = "ws://127.0.0.1:1" // a dial here would fail with a connection error
	t.Cleanup(func() { geminiLiveWSBase = old })
	_, err := runAITask(context.Background(), Settings{}, providerGeminiLive, nudgeTask("q", "a"), &n)
	if err == nil || !strings.Contains(err.Error(), "Gemini API key") || strings.Contains(err.Error(), "reach") {
		t.Fatalf("an unconfigured provider should fail with its setup reason before connecting: %v", err)
	}
}

func TestRunAITaskReturnsModel(t *testing.T) {
	fakeLiveServer(t, replyWithToolCall(t, map[string]any{"nudge": "Lead with the result", "kind": "tip"}, nil))
	var n Nudge
	model, err := runAITask(context.Background(), Settings{GeminiKey: "k", GeminiLiveModel: "gemini-3.8-live"}, providerGeminiLive, nudgeTask("q", "a"), &n)
	if err != nil || n.Nudge != "Lead with the result" || model != "gemini-3.8-live" {
		t.Fatalf("n = %+v, model = %q, err = %v", n, model, err)
	}
}
