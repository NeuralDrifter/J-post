// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

// Package aitest provides a fake Anthropic API and a fake Claude Code CLI for
// tests in other packages, in the style of net/http/httptest.
package aitest

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"sync"
	"testing"

	"jobtrack/internal/ai"
	"jobtrack/internal/settings"
)

// FakeAnthropic serves /v1/messages with handler and points the provider at it.
func FakeAnthropic(t *testing.T, handler http.HandlerFunc) {
	t.Helper()
	srv := httptest.NewServer(handler)
	t.Cleanup(srv.Close)
	ai.SetTestAnthropic(t, srv.URL)
}

// AnthropicReply is a Messages API response whose only content is text.
func AnthropicReply(model, text, stopReason string) []byte {
	b, _ := json.Marshal(map[string]any{
		"id": "msg_1", "type": "message", "role": "assistant", "model": model,
		"content":     []any{map[string]any{"type": "text", "text": text}},
		"stop_reason": stopReason,
		"usage":       map[string]any{"input_tokens": 10, "output_tokens": 5},
	})
	return b
}

// AnthropicSettings configures the Anthropic provider with a fake key.
var AnthropicSettings = settings.Settings{AnthropicKey: "sk-ant-s3cret", AnthropicModel: "claude-opus-5-5", AnthropicGradingEffort: "high", AnthropicTipsEffort: "low"}

var (
	fakeClaudeOnce sync.Once
	fakeClaudePath string
	fakeClaudeErr  error
)

// buildFakeClaude compiles internal/ai/testdata/fakeclaude once per test run.
func buildFakeClaude(t *testing.T) string {
	t.Helper()
	fakeClaudeOnce.Do(func() {
		_, here, _, _ := runtime.Caller(0)
		src := filepath.Join(filepath.Dir(here), "..", "testdata", "fakeclaude")
		dir, err := os.MkdirTemp("", "fakeclaude-*")
		if err != nil {
			fakeClaudeErr = err
			return
		}
		name := "claude"
		if runtime.GOOS == "windows" {
			name += ".exe"
		}
		fakeClaudePath = filepath.Join(dir, name)
		cmd := exec.Command("go", "build", "-o", fakeClaudePath, ".")
		cmd.Dir = src
		if out, err := cmd.CombinedOutput(); err != nil {
			fakeClaudeErr = err
			t.Logf("%s", out)
		}
	})
	if fakeClaudeErr != nil {
		t.Fatalf("building fake claude: %v", fakeClaudeErr)
	}
	return fakeClaudePath
}

// UseFakeClaude points the Claude Code provider at the fake CLI in the given
// mode (see testdata/fakeclaude) and at a temp root the test can inspect.
func UseFakeClaude(t *testing.T, mode string) (settings.Settings, string) {
	t.Helper()
	path := buildFakeClaude(t)
	t.Setenv("FAKE_MODE", mode)
	root := t.TempDir()
	ai.SetTestClaudeCodeTempRoot(t, root)
	return settings.Settings{ClaudeCodePath: path}, root
}

// AssertEmptyDir fails the test if dir has anything in it.
func AssertEmptyDir(t *testing.T, dir string) {
	t.Helper()
	entries, _ := os.ReadDir(dir)
	if len(entries) != 0 {
		t.Fatalf("temp files left behind in %s: %v", dir, entries)
	}
}
