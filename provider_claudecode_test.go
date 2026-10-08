// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

package main

import (
	"context"
	"encoding/json"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"slices"
	"strings"
	"sync"
	"testing"
	"time"

	"jobtrack/internal/settings"
)

var (
	fakeClaudeOnce sync.Once
	fakeClaudePath string
	fakeClaudeErr  error
)

// buildFakeClaude compiles testdata/fakeclaude once per test run.
func buildFakeClaude(t *testing.T) string {
	t.Helper()
	fakeClaudeOnce.Do(func() {
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
		out, err := exec.Command("go", "build", "-o", fakeClaudePath, "./testdata/fakeclaude").CombinedOutput()
		if err != nil {
			fakeClaudeErr = err
			t.Logf("%s", out)
		}
	})
	if fakeClaudeErr != nil {
		t.Fatalf("building fake claude: %v", fakeClaudeErr)
	}
	return fakeClaudePath
}

// useFakeClaude points the provider at the fake CLI in the given mode and at
// a temp root the test can inspect.
func useFakeClaude(t *testing.T, mode string) (settings.Settings, string) {
	t.Helper()
	path := buildFakeClaude(t)
	t.Setenv("FAKE_MODE", mode)
	root := t.TempDir()
	old := claudeCodeTempRoot
	claudeCodeTempRoot = root
	t.Cleanup(func() { claudeCodeTempRoot = old })
	return settings.Settings{ClaudeCodePath: path}, root
}

func assertEmptyDir(t *testing.T, dir string) {
	t.Helper()
	entries, _ := os.ReadDir(dir)
	if len(entries) != 0 {
		t.Fatalf("temp files left behind in %s: %v", dir, entries)
	}
}

func TestClaudeCodeArgs(t *testing.T) {
	task := nudgeTask("q", "a")
	args := claudeCodeArgs(task, `C:\tmp\mcp.json`, settings.Settings{})
	joined := strings.Join(args, "\x00")
	for _, want := range [][]string{
		{"-p"},
		{"--system-prompt", task.instruction},
		{"--setting-sources", ""},
		{"--strict-mcp-config"},
		{"--mcp-config", `C:\tmp\mcp.json`},
		{"--tools", ""},
		{"--disable-slash-commands"},
		{"--allowedTools", "mcp__jobtrack__get_input", "mcp__jobtrack__submit_result"},
		{"--no-session-persistence"},
		{"--output-format", "json"},
	} {
		if !strings.Contains(joined, strings.Join(want, "\x00")) {
			t.Errorf("args missing %q: %q", want, args)
		}
	}
	if args[0] != "-p" || strings.HasPrefix(args[1], "--") {
		t.Errorf("the prompt must directly follow -p (variadic flags would swallow it later): %q", args)
	}
	if slices.Contains(args, "--bare") || slices.Contains(args, "--model") {
		t.Errorf("no --bare (it skips the OAuth login), and no --model unless set: %q", args)
	}
	withModel := claudeCodeArgs(task, "m.json", settings.Settings{ClaudeCodeModel: "sonnet"})
	if !strings.Contains(strings.Join(withModel, "\x00"), "--model\x00sonnet") {
		t.Errorf("model not passed: %q", withModel)
	}
}

func TestClaudeCodeRunsAndReadsResult(t *testing.T) {
	s, root := useFakeClaude(t, "ok")
	argsFile := filepath.Join(t.TempDir(), "args.json")
	t.Setenv("FAKE_ARGS", argsFile)
	var n Nudge
	model, err := runAITask(context.Background(), s, settings.ProviderClaudeCode, nudgeTask("q", "a"), &n)
	if err != nil || n.Nudge != "From the fake" || model != "claude-opus-5-5" {
		t.Fatalf("n = %+v, model = %q, err = %v", n, model, err)
	}
	assertEmptyDir(t, root)
	var args []string
	raw, _ := os.ReadFile(argsFile)
	json.Unmarshal(raw, &args)
	if len(args) == 0 || args[0] != "-p" {
		t.Fatalf("argv = %q", args)
	}
}

func TestClaudeCodeMCPConfigPointsAtThisExecutable(t *testing.T) {
	exe, _ := os.Executable()
	cfg := claudeCodeMCPConfig(`C:\tmp\task.json`)
	server := cfg["mcpServers"].(map[string]any)["jobtrack"].(map[string]any)
	if server["command"] != exe || !slices.Equal(server["args"].([]string), []string{aiTaskMCPFlag, `C:\tmp\task.json`}) {
		t.Fatalf("server = %v", server)
	}
}

func TestClaudeCodeSurfacesErrorResult(t *testing.T) {
	s, root := useFakeClaude(t, "error")
	var n Nudge
	_, err := runAITask(context.Background(), s, settings.ProviderClaudeCode, nudgeTask("q", "a"), &n)
	if err == nil || !strings.Contains(err.Error(), "Please run /login") {
		t.Fatalf("err = %v", err)
	}
	assertEmptyDir(t, root)
}

func TestClaudeCodeWithoutSubmitFails(t *testing.T) {
	s, root := useFakeClaude(t, "nosubmit")
	var n Nudge
	_, err := runAITask(context.Background(), s, settings.ProviderClaudeCode, nudgeTask("q", "a"), &n)
	if err == nil || !strings.Contains(err.Error(), "without") {
		t.Fatalf("err = %v", err)
	}
	assertEmptyDir(t, root)
}

func TestClaudeCodeTimesOutAndCleansUp(t *testing.T) {
	s, root := useFakeClaude(t, "sleep")
	old := claudeCodeTimeout[roleTips]
	claudeCodeTimeout[roleTips] = 300 * time.Millisecond
	t.Cleanup(func() { claudeCodeTimeout[roleTips] = old })
	start := time.Now()
	var n Nudge
	_, err := runAITask(context.Background(), s, settings.ProviderClaudeCode, nudgeTask("q", "a"), &n)
	if err == nil || !strings.Contains(err.Error(), "too long") || time.Since(start) > 5*time.Second {
		t.Fatalf("err = %v after %s", err, time.Since(start))
	}
	assertEmptyDir(t, root)
}

func TestFindClaudeCode(t *testing.T) {
	path := buildFakeClaude(t)
	if got, err := findClaudeCode(settings.Settings{ClaudeCodePath: path}); err != nil || got != path {
		t.Fatalf("explicit path: %q, %v", got, err)
	}
	if _, err := findClaudeCode(settings.Settings{ClaudeCodePath: filepath.Join(t.TempDir(), "nope.exe")}); err == nil {
		t.Fatal("a missing explicit path should fail")
	}
	t.Setenv("PATH", filepath.Dir(path))
	t.Setenv("USERPROFILE", t.TempDir())
	t.Setenv("HOME", t.TempDir())
	if got, err := findClaudeCode(settings.Settings{}); err != nil || !strings.EqualFold(got, path) {
		t.Fatalf("PATH lookup: %q, %v", got, err)
	}
	t.Setenv("PATH", t.TempDir())
	if (claudeCodeProvider{}).unavailable(settings.Settings{}) == "" {
		t.Fatal("no claude anywhere should make the provider unavailable")
	}
}

func TestClaudeCodeVersion(t *testing.T) {
	s, _ := useFakeClaude(t, "version")
	if v, err := claudeCodeVersion(context.Background(), s); err != nil || !strings.Contains(v, "Claude Code") {
		t.Fatalf("v = %q, err = %v", v, err)
	}
}

func TestClaudeCodeTimeoutKillsTheWholeProcessTree(t *testing.T) {
	s, root := useFakeClaude(t, "grandchild")
	old := claudeCodeTimeout[roleTips]
	claudeCodeTimeout[roleTips] = 500 * time.Millisecond
	t.Cleanup(func() { claudeCodeTimeout[roleTips] = old })
	start := time.Now()
	var n Nudge
	_, err := runAITask(context.Background(), s, settings.ProviderClaudeCode, nudgeTask("q", "a"), &n)
	if err == nil || !strings.Contains(err.Error(), "too long") || time.Since(start) > 6*time.Second {
		t.Fatalf("a grandchild holding the output pipe must not keep the run alive: err = %v after %s", err, time.Since(start))
	}
	assertEmptyDir(t, root)
}
