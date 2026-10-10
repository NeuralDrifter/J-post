// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

package discover

import (
	"bytes"
	"context"
	_ "embed"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"jobtrack/internal/osproc"
	"jobtrack/internal/textproc"
)

// The JobSpy scraper (Indeed, LinkedIn, ZipRecruiter): scraper.py run with the
// user's Python, which must have python-jobspy installed.

//go:embed scraper.py
var scraperScript []byte

var (
	jobspyTimeout   = 90 * time.Second
	selfTestTimeout = 30 * time.Second
)

func resolvePython(override, exeDir, cwd string) (string, error) {
	var candidates []string
	if override != "" {
		candidates = append(candidates, override)
	}
	candidates = append(candidates,
		filepath.Join(exeDir, "venv", "Scripts", "python.exe"),
		filepath.Join(cwd, "venv", "Scripts", "python.exe"))
	for _, c := range candidates {
		if info, err := os.Stat(c); err == nil && !info.IsDir() {
			return c, nil
		}
	}
	return "", fmt.Errorf("Python with JobSpy not found (checked %s). Set the Python path in Settings", strings.Join(candidates, ", "))
}

// FindPython locates the Python that has JobSpy: the Settings override, else a
// venv next to the app or in the working directory.
func FindPython(override string) (string, error) {
	cwd, _ := os.Getwd() // "" just drops that candidate's directory
	return resolvePython(strings.TrimSpace(override), exeDir(), cwd)
}

func exeDir() string {
	p, err := os.Executable()
	if err != nil {
		return ""
	}
	return filepath.Dir(p)
}

var errUnreadableOutput = errors.New("unreadable scraper output")

// parseScraperOutput reads the JSON payload from the last non-empty stdout
// line, ignoring any log noise printed before it.
func parseScraperOutput(out []byte) ([]RawJob, error) {
	line := textproc.LastLine(string(out), "")
	var payload struct {
		Jobs  []RawJob `json:"jobs"`
		Error string   `json:"error"`
	}
	if line == "" || json.Unmarshal([]byte(line), &payload) != nil {
		return nil, fmt.Errorf("%w: %q", errUnreadableOutput, textproc.Truncate(line, 200))
	}
	if payload.Error != "" {
		return nil, errors.New(payload.Error)
	}
	if payload.Jobs == nil {
		payload.Jobs = []RawJob{}
	}
	return payload.Jobs, nil
}

func runScraperScript(ctx context.Context, python string, timeout time.Duration, args ...string) ([]RawJob, error) {
	f, err := os.CreateTemp("", "jobtrack_scraper_*.py")
	if err != nil {
		return nil, err
	}
	defer os.Remove(f.Name())
	if _, err := f.Write(scraperScript); err != nil {
		f.Close()
		return nil, err
	}
	if err := f.Close(); err != nil {
		return nil, err
	}

	ctx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()
	cmd := exec.CommandContext(ctx, python, append([]string{f.Name()}, args...)...)
	osproc.HideConsole(cmd)
	cmd.Env = append(os.Environ(), "PYTHONIOENCODING=utf-8")
	var stdout, stderr bytes.Buffer
	cmd.Stdout, cmd.Stderr = &stdout, &stderr
	runErr := cmd.Run()
	if errors.Is(ctx.Err(), context.DeadlineExceeded) {
		return nil, fmt.Errorf("timed out after %s", timeout)
	}
	jobs, err := parseScraperOutput(stdout.Bytes())
	if err != nil && runErr != nil && errors.Is(err, errUnreadableOutput) {
		return nil, fmt.Errorf("scraper failed: %s", textproc.LastLine(stderr.String(), runErr.Error()))
	}
	return jobs, err
}

func RunJobSpy(ctx context.Context, python, site string, q DiscoverQuery, opts FetchOptions) ([]RawJob, error) {
	args := []string{"--site", site, "--term", q.Term, "--location", q.Location}
	if q.RemoteOnly {
		args = append(args, "--remote")
	}
	if opts.Results > 0 {
		args = append(args, "--results", strconv.Itoa(opts.Results))
	}
	if opts.HoursOld > 0 {
		args = append(args, "--hours-old", strconv.Itoa(opts.HoursOld))
	}
	return runScraperScript(ctx, python, jobspyTimeout, args...)
}

// CheckScraper verifies that python can import JobSpy (Settings "Test" button).
func CheckScraper(ctx context.Context, python string) error {
	_, err := runScraperScript(ctx, python, selfTestTimeout, "--self-test")
	return err
}
