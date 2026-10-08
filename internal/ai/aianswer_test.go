// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

package ai

import (
	"encoding/json"
	"errors"
	"strings"
	"testing"
)

func checkExtract(t *testing.T, text, want string) {
	t.Helper()
	got, err := extractJSON(text)
	if err != nil {
		t.Fatalf("extractJSON(%q): %v", text, err)
	}
	if string(got) != want {
		t.Fatalf("extractJSON(%q) = %s, want %s", text, got, want)
	}
}

func TestExtractJSONPlain(t *testing.T) {
	checkExtract(t, "  {\"kind\": \"tip\"}\n", `{"kind": "tip"}`)
}

func TestExtractJSONFenced(t *testing.T) {
	checkExtract(t, "```json\n{\"kind\": \"tip\"}\n```", `{"kind": "tip"}`)
	checkExtract(t, "```\n{\"kind\": \"good\"}\n```", `{"kind": "good"}`)
}

func TestExtractJSONProse(t *testing.T) {
	checkExtract(t, `Here is the result: {"kind": "tip", "nudge": "Use {braces}"} Hope that helps`, `{"kind": "tip", "nudge": "Use {braces}"}`)
}

func TestExtractJSONEmpty(t *testing.T) {
	if _, err := extractJSON(" \n "); !errors.Is(err, errEmptyAnswer) {
		t.Fatalf("err = %v, want errEmptyAnswer", err)
	}
}

func TestExtractJSONNoBraces(t *testing.T) {
	if _, err := extractJSON("I can't help with that."); !errors.Is(err, errNoJSON) {
		t.Fatalf("err = %v, want errNoJSON", err)
	}
}

func TestExtractJSONBadSyntax(t *testing.T) {
	if _, err := extractJSON(`{"kind": "tip",}`); err == nil {
		t.Fatal("trailing comma should be a syntax error")
	}
}

func TestValidateAnswerOK(t *testing.T) {
	if err := validateAnswer(json.RawMessage(`{"nudge": "Slow down", "kind": "tip"}`), testNudgeSchema); err != nil {
		t.Fatal(err)
	}
}

func TestValidateAnswerMissingRequired(t *testing.T) {
	err := validateAnswer(json.RawMessage(`{"kind": "tip"}`), testNudgeSchema)
	if err == nil || !strings.Contains(err.Error(), "nudge") {
		t.Fatalf("err = %v, want it to name the missing nudge", err)
	}
}

func TestValidateAnswerExtraProperty(t *testing.T) {
	if err := validateAnswer(json.RawMessage(`{"nudge": "x", "kind": "tip", "score": 9}`), testNudgeSchema); err == nil {
		t.Fatal("extra property should be rejected (additionalProperties: false)")
	}
}

func TestValidateAnswerBadEnum(t *testing.T) {
	if err := validateAnswer(json.RawMessage(`{"nudge": "x", "kind": "great"}`), testNudgeSchema); err == nil {
		t.Fatal("kind outside the enum should be rejected")
	}
}
