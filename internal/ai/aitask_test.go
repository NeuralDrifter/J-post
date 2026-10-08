// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

package ai

import (
	"context"
	"reflect"
	"slices"
	"strings"
	"testing"
	"time"

	"jobtrack/internal/gemini"
	"jobtrack/internal/gemini/geminitest"
	"jobtrack/internal/settings"
)

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
	if got := GeminiSchema(in); !reflect.DeepEqual(got, want) {
		t.Fatalf("got %#v", got)
	}
	if in["type"] != "object" {
		t.Fatal("the conversion must not modify the task's schema")
	}
}

func TestRunAITaskUnknownAndUnavailable(t *testing.T) {
	var n testNudge
	if _, err := RunTask(context.Background(), settings.Settings{}, "nope", testNudgeTask("q", "a"), &n); err == nil {
		t.Fatal("unknown provider should fail")
	}
	gemini.SetTestEndpoints(t, "", "ws://127.0.0.1:1") // a dial here would fail with a connection error
	_, err := RunTask(context.Background(), settings.Settings{}, settings.ProviderGeminiLive, testNudgeTask("q", "a"), &n)
	if err == nil || !strings.Contains(err.Error(), "Gemini API key") || strings.Contains(err.Error(), "reach") {
		t.Fatalf("an unconfigured provider should fail with its setup reason before connecting: %v", err)
	}
}

func TestRunAITaskReturnsModel(t *testing.T) {
	geminitest.FakeLiveServer(t, geminitest.ReplyWithToolCall(t, map[string]any{"nudge": "Lead with the result", "kind": "tip"}, nil))
	var n testNudge
	model, err := RunTask(context.Background(), settings.Settings{GeminiKey: "k", GeminiLiveModel: "gemini-3.8-live"}, settings.ProviderGeminiLive, testNudgeTask("q", "a"), &n)
	if err != nil || n.Nudge != "Lead with the result" || model != "gemini-3.8-live" {
		t.Fatalf("n = %+v, model = %q, err = %v", n, model, err)
	}
}

func TestListAIProvidersReadiness(t *testing.T) {
	// Hide any real Claude Code install so "nothing configured" really means nothing.
	t.Setenv("PATH", t.TempDir())
	t.Setenv("USERPROFILE", t.TempDir())
	t.Setenv("HOME", t.TempDir())
	list := ListAIProviders(settings.Settings{})
	var ids []string
	for _, p := range list {
		ids = append(ids, p.ID)
		if p.Label == "" || p.Unavailable == "" {
			t.Errorf("%s: label %q, unavailable %q (unconfigured providers need a reason)", p.ID, p.Label, p.Unavailable)
		}
	}
	if got := strings.Join(ids, ","); got != "gemini-live,anthropic,claude-code,openai,deepseek,ollama,lmstudio,openai-compatible" {
		t.Fatalf("ids = %s", got)
	}
	if ListAIProviders(settings.Settings{GeminiKey: "k"})[0].Unavailable != "" {
		t.Fatal("Gemini with a key should be ready")
	}
}

func TestProviderIDsMatchRegistry(t *testing.T) {
	var ids []string
	for _, p := range aiProviders() {
		ids = append(ids, p.id())
	}
	if !slices.Equal(ids, settings.AIProviderIDs) {
		t.Fatalf("aiProviders() = %v, but settings accept %v", ids, settings.AIProviderIDs)
	}
}

func TestPlanningRoleLimits(t *testing.T) {
	if claudeCodeTimeout[RolePlanning] != 3*time.Minute || anthropicTimeout[RolePlanning] != 2*time.Minute || anthropicMaxTokens[RolePlanning] != 16000 {
		t.Fatalf("claude code %v, anthropic %v / %d", claudeCodeTimeout[RolePlanning], anthropicTimeout[RolePlanning], anthropicMaxTokens[RolePlanning])
	}
}

func TestMatchingRoleLimits(t *testing.T) {
	if anthropicMaxTokens[RoleMatching] != 16000 || anthropicTimeout[RoleMatching] != 5*time.Minute ||
		openAIMaxTokens[RoleMatching] != 16000 || openAITimeout[RoleMatching] != 5*time.Minute ||
		claudeCodeTimeout[RoleMatching] != 5*time.Minute {
		t.Fatalf("anthropic %d/%v, openai %d/%v, claude code %v", anthropicMaxTokens[RoleMatching], anthropicTimeout[RoleMatching],
			openAIMaxTokens[RoleMatching], openAITimeout[RoleMatching], claudeCodeTimeout[RoleMatching])
	}
}
