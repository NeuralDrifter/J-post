// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

package choicegen

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestChoicesUpToDate(t *testing.T) {
	committed, err := os.ReadFile(filepath.Join("..", "..", filepath.FromSlash(OutputPath)))
	if err != nil {
		t.Fatalf("%v — run go generate ./...", err)
	}
	// Git may check the file out with CRLF line endings on Windows.
	if got := strings.ReplaceAll(string(committed), "\r\n", "\n"); got != Render() {
		t.Fatalf("%s is out of date with the backend's lists — run go generate ./...", OutputPath)
	}
}

func TestRenderListsEveryValue(t *testing.T) {
	out := Render()
	for _, want := range []string{
		"export const STATUSES = ['interested', 'applied', 'interviewing', 'offer', 'closed'] as const",
		"export const WORK_MODES = ['remote', 'hybrid', 'onsite'] as const",
		"  { id: 'plain', label: 'plain — works with any server' },",
		"export const NATIONAL_AREA = 'US'",
		"export const NO_PLAN_PROVIDER = 'none'",
		"  { id: 'resumes', label: 'Resumes' },",
		"  { id: 'resumeTailor', group: 'resumes', label: 'Tailor to a job' },",
	} {
		if !strings.Contains(out, want) {
			t.Errorf("missing %q in:\n%s", want, out)
		}
	}
}

func TestTSStringEscapes(t *testing.T) {
	if got := tsString(`it's a \ test`); got != `'it\'s a \\ test'` {
		t.Fatalf("got %s", got)
	}
}
