package main

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"time"
)

// claudeCodeProvider runs tasks with headless Claude Code (`claude -p`) on the
// user's Claude login. Each run gets a temporary MCP server (this executable
// with aiTaskMCPFlag) that offers get_input and submit_result; it is never
// added to the user's Claude Code configuration, and the temp folder holding
// its files is deleted when the run ends.
type claudeCodeProvider struct{}

var (
	claudeCodeTimeout  = map[aiRole]time.Duration{roleGrading: 5 * time.Minute, roleTips: 60 * time.Second}
	claudeCodeTempRoot = "" // "" = the OS temp folder; tests point it somewhere they can inspect
	// claudeCodeMCPExecutable serves the per-run MCP server; "" = this executable.
	// (Inside `go test` this executable is the test binary, so end-to-end checks
	// point it at the built app.)
	claudeCodeMCPExecutable = ""
)

const claudeCodePrompt = "Call get_input to read the material, then call submit_result exactly once with your answer."

func (claudeCodeProvider) id() string    { return providerClaudeCode }
func (claudeCodeProvider) label() string { return "Claude Code" }

func (claudeCodeProvider) unavailable(s Settings) string {
	if _, err := findClaudeCode(s); err != nil {
		return err.Error()
	}
	return ""
}

// findClaudeCode locates the CLI: the Settings path, else `claude` on PATH,
// else the default install folder (~/.local/bin).
func findClaudeCode(s Settings) (string, error) {
	if s.ClaudeCodePath != "" {
		if info, err := os.Stat(s.ClaudeCodePath); err != nil || info.IsDir() {
			return "", fmt.Errorf("Claude Code wasn't found at %s; fix the path in Settings → AI", s.ClaudeCodePath)
		}
		return s.ClaudeCodePath, nil
	}
	if path, err := exec.LookPath("claude"); err == nil {
		return path, nil
	}
	if home, err := os.UserHomeDir(); err == nil {
		name := "claude"
		if runtime.GOOS == "windows" {
			name += ".exe"
		}
		path := filepath.Join(home, ".local", "bin", name)
		if info, err := os.Stat(path); err == nil && !info.IsDir() {
			return path, nil
		}
	}
	return "", errors.New("Claude Code isn't installed (or set its path in Settings → AI)")
}

// claudeCodeArgs are the flags for one isolated headless run. Not --bare: bare
// mode never reads the OAuth login, so the user's Claude plan wouldn't be used.
func claudeCodeArgs(t aiTask, mcpConfigPath string, s Settings) []string {
	args := []string{
		"-p", claudeCodePrompt, // the prompt must come right after -p; later variadic flags would swallow it
		"--system-prompt", t.instruction,
		"--setting-sources", "", // none of the user's settings, hooks or CLAUDE.md
		"--strict-mcp-config", "--mcp-config", mcpConfigPath,
		"--tools", "", // no built-in tools
		"--disable-slash-commands",
		"--allowedTools", "mcp__jobtrack__get_input", "mcp__jobtrack__submit_result",
		"--no-session-persistence",
		"--output-format", "json",
	}
	if s.ClaudeCodeModel != "" {
		args = append(args, "--model", s.ClaudeCodeModel)
	}
	return args
}

// claudeCodeMCPConfig points Claude Code at this executable as the task's MCP server.
func claudeCodeMCPConfig(taskPath string) map[string]any {
	exe := claudeCodeMCPExecutable
	if exe == "" {
		exe, _ = os.Executable()
	}
	return map[string]any{"mcpServers": map[string]any{
		"jobtrack": map[string]any{"command": exe, "args": []string{aiTaskMCPFlag, taskPath}},
	}}
}

// claudeCodeOutput is the part of `--output-format json` this provider reads.
type claudeCodeOutput struct {
	IsError    bool                       `json:"is_error"`
	Result     string                     `json:"result"`
	ModelUsage map[string]json.RawMessage `json:"modelUsage"`
}

func (claudeCodeProvider) run(ctx context.Context, s Settings, t aiTask) (aiResult, error) {
	claude, err := findClaudeCode(s)
	if err != nil {
		return aiResult{}, err
	}
	dir, err := os.MkdirTemp(claudeCodeTempRoot, "jobtrack-ai-*")
	if err != nil {
		return aiResult{}, err
	}
	defer os.RemoveAll(dir)

	task := mcpTaskFile{Instruction: t.instruction, Input: t.input, Schema: t.schema, OutputPath: filepath.Join(dir, "result.json")}
	taskPath, mcpPath := filepath.Join(dir, "task.json"), filepath.Join(dir, "mcp.json")
	if err := writeJSONFile(taskPath, task); err != nil {
		return aiResult{}, err
	}
	if err := writeJSONFile(mcpPath, claudeCodeMCPConfig(taskPath)); err != nil {
		return aiResult{}, err
	}

	timeout := claudeCodeTimeout[t.role]
	ctx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()
	cmd := exec.CommandContext(ctx, claude, claudeCodeArgs(t, mcpPath, s)...)
	cmd.Dir = dir // keeps any project's CLAUDE.md out of the run
	hideConsole(cmd)
	var stdout, stderr bytes.Buffer
	cmd.Stdout, cmd.Stderr = &stdout, &stderr // stdin stays closed, so it never waits for input
	runErr := cmd.Run()
	if errors.Is(ctx.Err(), context.DeadlineExceeded) {
		return aiResult{}, fmt.Errorf("Claude Code took too long (over %s)", timeout)
	}

	var out claudeCodeOutput
	_ = json.Unmarshal(stdout.Bytes(), &out) // unreadable output is reported below
	if raw, err := os.ReadFile(task.OutputPath); err == nil {
		return aiResult{raw: raw, model: claudeCodeModel(out, s)}, nil
	}
	switch {
	case out.IsError:
		return aiResult{}, fmt.Errorf("Claude Code: %s", truncate(out.Result, 300))
	case runErr != nil:
		return aiResult{}, fmt.Errorf("Claude Code failed: %s", lastLine(stderr.String(), runErr.Error()))
	default:
		return aiResult{}, fmt.Errorf("Claude Code finished without submitting a result: %s", truncate(out.Result, 200))
	}
}

// claudeCodeModel is the model the run reports, else the configured one, else "".
func claudeCodeModel(out claudeCodeOutput, s Settings) string {
	for model := range out.ModelUsage {
		return model
	}
	return s.ClaudeCodeModel
}

// claudeCodeVersion runs `claude --version` for the Settings "Test" button.
func claudeCodeVersion(ctx context.Context, s Settings) (string, error) {
	claude, err := findClaudeCode(s)
	if err != nil {
		return "", err
	}
	ctx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()
	cmd := exec.CommandContext(ctx, claude, "--version")
	hideConsole(cmd)
	out, err := cmd.Output()
	if err != nil {
		return "", fmt.Errorf("Claude Code didn't start: %v", err)
	}
	return strings.TrimSpace(string(out)), nil
}

func writeJSONFile(path string, v any) error {
	raw, err := json.Marshal(v)
	if err != nil {
		return err
	}
	return os.WriteFile(path, raw, 0o600)
}
