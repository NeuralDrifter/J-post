# Job Match Scores Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show an AI-graded match % on every Discover posting, with a click-through breakdown, scored a few large requests per search.

**Architecture:** New settings fields hold the switch, provider, request size and preferences. A new `ai.RoleMatching` gets its own budgets. `internal/app/match.go` builds the `jobMatch` task, pairs the answer with postings and computes the overall % from fixed weights. `match_store.go` keeps one row per posting in a new `posting_scores` table. `match_run.go` sends requests one after another and stops at the first failure. The App binds `ScoreInbox`, `RescoreOutdated` and `ScorePosting` and emits `search:progress` / `match:progress` events. The Discover page shows a status line, badges, a breakdown dialog and a "Best match" sort.

**Tech Stack:** Go 1.26, SQLite (modernc), Wails v2 (bindings + runtime events), React + TypeScript, Tailwind, vitest.

**Spec:** `docs/superpowers/specs/2026-10-08-job-match-scores-design.md`

## Global Constraints

- Every new source file starts with the two-line header the copyright test checks:
  `// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)` and `// SPDX-License-Identifier: MIT`.
- Weights: resume fit 50, seniority 20, work mode & location 15, salary 15. Overall = round(Σ weight × score / Σ weight) over applicable factors; scores clamped to 0–100.
- `matchPerRequest` default 25, allowed 5–50. `matchEnabled` default false. `matchProvider` default `gemini-live`.
- Seniority values: `entry`, `mid`, `senior`, `staff`, `principal`, `manager` (or empty). Work modes: `remote`, `hybrid`, `onsite`.
- Descriptions are cut to 1,500 characters with `textproc.Truncate`. Strengths and gaps are capped at 3 each.
- Requests are sent one after another, never in parallel. No automatic retries. The run stops at the first failed request.
- Status texts (exact): `Add your resume on the Profile page to get match scores`, `Job matching: <provider reason>`, `Scoring stopped: <error>`, `Scoring is already running`.
- Badge bands: 80+ green (success), 60–79 amber (warn), below 60 grey (neutral).
- Run `bash tools/verify.sh` (exit code 0, last line `verify: all green`) before every commit. Check the exit code, never only the tail of the output.
- Run `wails generate module` after changing any Go type or method the frontend sees; commit `frontend/wailsjs` changes with the task.

## Review Focus

- **A resume that is only whitespace** must count as no resume: no request is sent and the status line asks for a resume (Task 5 test `TestRunMatchSafeguards`).
- **AI answers with scores outside 0–100** (e.g. 130 or -5) must be clamped, not stored or shown as-is (Task 3 test `TestMatchScoresClampsAndPairs`).
- **A posting deleted while its request is in flight** (e.g. "Clear older than 90 days") must not stop the run or raise an error (Task 4 test `TestSaveMatchScoreSkipsDeletedPosting`, Task 5 test `TestRunMatchSkipsPostingDeletedMidRun`).
- **Long descriptions in non-ASCII text** must be cut on whole characters and stay valid JSON/UTF-8 (Task 3 test `TestMatchTaskInput`).
- **A cached search (nothing re-scraped) or a search with no new postings** must not start a scoring run, so it never spends a request (Task 6 test `shouldAutoScore`).

---

### Task 1: Settings fields for job matching

**Files:**
- Modify: `internal/settings/settings.go`
- Test: `internal/settings/settings_test.go`

**Interfaces:**
- Consumes: nothing new.
- Produces: `Settings` fields `MatchEnabled bool`, `MatchProvider string`, `MatchPerRequest int`, `MatchMinSalary int64`, `MatchWorkModes []string`, `MatchLocations string`, `MatchSeniority string`, `MatchGoals string` (JSON names `matchEnabled`, `matchProvider`, `matchPerRequest`, `matchMinSalary`, `matchWorkModes`, `matchLocations`, `matchSeniority`, `matchGoals`). Exported `DefaultMatchPerRequest = 25`, `MatchWorkModeOptions`, `MatchSeniorityOptions`.

- [ ] **Step 1: Write the failing tests**

Add to `internal/settings/settings_test.go`:

```go
func TestMatchDefaults(t *testing.T) {
	s, err := NewSettingsStore(t.TempDir()).Load()
	if err != nil || s.MatchEnabled || s.MatchProvider != ProviderGeminiLive || s.MatchPerRequest != DefaultMatchPerRequest ||
		s.MatchWorkModes == nil || len(s.MatchWorkModes) != 0 || s.MatchSeniority != "" || s.MatchMinSalary != 0 {
		t.Fatalf("s = %+v, %v", s, err)
	}
}

func TestMatchSettingsValidation(t *testing.T) {
	store := NewSettingsStore(t.TempDir())
	bad := map[string]Settings{
		"too few per request":  {MatchPerRequest: 4},
		"too many per request": {MatchPerRequest: 51},
		"unknown work mode":    {MatchWorkModes: []string{"remote", "moon"}},
		"unknown seniority":    {MatchSeniority: "wizard"},
		"negative salary":      {MatchMinSalary: -1},
		"unknown provider":     {MatchProvider: "nope"},
	}
	for name, s := range bad {
		if err := store.Save(s); err == nil {
			t.Errorf("%s: expected an error", name)
		}
	}
	ok := Settings{MatchEnabled: true, MatchProvider: ProviderAnthropic, MatchPerRequest: 5, MatchMinSalary: 120000,
		MatchWorkModes: []string{"onsite", "remote"}, MatchLocations: "  Denver, CO ", MatchSeniority: "senior", MatchGoals: " no on-call "}
	if err := store.Save(ok); err != nil {
		t.Fatal(err)
	}
	got, _ := store.Load()
	if got.MatchLocations != "Denver, CO" || got.MatchGoals != "no on-call" || got.MatchPerRequest != 5 || !got.MatchEnabled {
		t.Fatalf("got %+v", got)
	}
}
```

Also update `TestSettingsRoundTrip`. Its `want` must now include the match fields, or `reflect.DeepEqual` fails on the new defaults. Append to the `want` literal:

```go
		MatchEnabled: true, MatchProvider: ProviderAnthropic, MatchPerRequest: 10, MatchMinSalary: 100000,
		MatchWorkModes: []string{"remote"}, MatchLocations: "Denver, CO", MatchSeniority: "staff", MatchGoals: "climate"}
```

(replacing the closing `}` of the existing literal).

- [ ] **Step 2: Run tests to verify they fail**

Run: `go test ./internal/settings/ -run "TestMatch|TestSettingsRoundTrip" -v`
Expected: compile failure, `unknown field MatchEnabled` / `undefined: DefaultMatchPerRequest`.

- [ ] **Step 3: Implement**

In `internal/settings/settings.go`:

Add to the `const` block of defaults:

```go
	DefaultMatchPerRequest = 25
	minMatchPerRequest     = 5
	maxMatchPerRequest     = 50
```

(`DefaultMatchPerRequest` is exported because the frontend and app tests use the value.)

Add after `anthropicEfforts`:

```go
// MatchWorkModeOptions and MatchSeniorityOptions are the values the job-match
// preferences accept.
var (
	MatchWorkModeOptions  = []string{"remote", "hybrid", "onsite"}
	MatchSeniorityOptions = []string{"entry", "mid", "senior", "staff", "principal", "manager"}
)
```

Add to the `Settings` struct, after `DiscoverCacheHours`:

```go
	// Job matching: Discover postings get an AI match score (see internal/app/match.go).
	MatchEnabled    bool     `json:"matchEnabled"`    // score new postings after each search
	MatchProvider   string   `json:"matchProvider"`   // an AI provider ID
	MatchPerRequest int      `json:"matchPerRequest"` // postings sent per request
	MatchMinSalary  int64    `json:"matchMinSalary"`  // annual floor in dollars; 0 = none
	MatchWorkModes  []string `json:"matchWorkModes"`  // MatchWorkModeOptions; empty = no preference
	MatchLocations  string   `json:"matchLocations"`
	MatchSeniority  string   `json:"matchSeniority"` // a MatchSeniorityOptions value; "" = no target
	MatchGoals      string   `json:"matchGoals"`     // free text: wants, must-haves, deal-breakers
```

Add to the end of `ApplyDefaults`:

```go
	s.MatchProvider = cmp.Or(s.MatchProvider, ProviderGeminiLive)
	if s.MatchPerRequest <= 0 {
		s.MatchPerRequest = DefaultMatchPerRequest
	}
	if s.MatchWorkModes == nil {
		s.MatchWorkModes = []string{}
	}
	s.MatchLocations = strings.TrimSpace(s.MatchLocations)
	s.MatchGoals = strings.TrimSpace(s.MatchGoals)
```

In `Save`, change the provider loop to include the match provider:

```go
	for _, id := range []string{settings.GradingProvider, settings.TipsProvider, settings.PlanProvider, settings.MatchProvider} {
```

and add these checks before `data, err := json.MarshalIndent(...)`:

```go
	if settings.MatchPerRequest < minMatchPerRequest || settings.MatchPerRequest > maxMatchPerRequest {
		return fmt.Errorf("postings per request must be between %d and %d", minMatchPerRequest, maxMatchPerRequest)
	}
	for _, m := range settings.MatchWorkModes {
		if !slices.Contains(MatchWorkModeOptions, m) {
			return fmt.Errorf("work mode must be one of %s", strings.Join(MatchWorkModeOptions, ", "))
		}
	}
	if settings.MatchSeniority != "" && !slices.Contains(MatchSeniorityOptions, settings.MatchSeniority) {
		return fmt.Errorf("seniority must be one of %s", strings.Join(MatchSeniorityOptions, ", "))
	}
	if settings.MatchMinSalary < 0 {
		return errors.New("the salary floor can't be negative")
	}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `go test ./internal/settings/ -v`
Expected: PASS (all settings tests).

- [ ] **Step 5: Regenerate bindings, verify, commit**

```bash
wails generate module
bash tools/verify.sh; echo "exit=$?"
git add internal/settings frontend/wailsjs
git commit -m "settings: job-matching switch, provider, request size and preferences"
```

---

### Task 2: AI role for matching

**Files:**
- Modify: `internal/ai/aitask.go`, `internal/ai/provider_anthropic.go:31-34`, `internal/ai/provider_openai.go:84-85`, `internal/ai/provider_claudecode.go:33`
- Test: `internal/ai/aitask_test.go`

**Interfaces:**
- Produces: `ai.RoleMatching` (a `Role`). Anthropic: 16,000 tokens, 5 min. OpenAI-style: 16,000 tokens, 5 min. Claude Code: 5 min. Anthropic picks the grading effort for every role except tips, so matching uses the grading effort with no change.

- [ ] **Step 1: Write the failing test**

Add to `internal/ai/aitask_test.go`:

```go
func TestMatchingRoleLimits(t *testing.T) {
	if anthropicMaxTokens[RoleMatching] != 16000 || anthropicTimeout[RoleMatching] != 5*time.Minute ||
		openAIMaxTokens[RoleMatching] != 16000 || openAITimeout[RoleMatching] != 5*time.Minute ||
		claudeCodeTimeout[RoleMatching] != 5*time.Minute {
		t.Fatalf("anthropic %d/%v, openai %d/%v, claude code %v", anthropicMaxTokens[RoleMatching], anthropicTimeout[RoleMatching],
			openAIMaxTokens[RoleMatching], openAITimeout[RoleMatching], claudeCodeTimeout[RoleMatching])
	}
}
```

(add `"time"` to the imports if `goimports` doesn't.)

- [ ] **Step 2: Run to verify it fails**

Run: `go test ./internal/ai/ -run TestMatchingRoleLimits -v`
Expected: compile failure `undefined: RoleMatching`.

- [ ] **Step 3: Implement**

`internal/ai/aitask.go`, in the role constants:

```go
const (
	RoleGrading Role = iota
	RoleTips
	RolePlanning
	RoleMatching // job match scores for Discover postings, many per request
)
```

Add `RoleMatching: 16000` / `RoleMatching: 5 * time.Minute` to each map:

```go
	anthropicMaxTokens  = map[Role]int64{RoleGrading: 16000, RoleTips: 1024, RolePlanning: 16000, RoleMatching: 16000}
	anthropicTimeout = map[Role]time.Duration{RoleGrading: 5 * time.Minute, RoleTips: 60 * time.Second, RolePlanning: 2 * time.Minute, RoleMatching: 5 * time.Minute}
	openAIMaxTokens       = map[Role]int64{RoleGrading: 16000, RoleTips: 1024, RolePlanning: 16000, RoleMatching: 16000}
	openAITimeout         = map[Role]time.Duration{RoleGrading: 5 * time.Minute, RoleTips: 60 * time.Second, RolePlanning: 2 * time.Minute, RoleMatching: 5 * time.Minute}
	claudeCodeTimeout  = map[Role]time.Duration{RoleGrading: 5 * time.Minute, RoleTips: 60 * time.Second, RolePlanning: 3 * time.Minute, RoleMatching: 5 * time.Minute}
```

(keep each line's existing alignment; run `gofmt -w` on the files.)

- [ ] **Step 4: Run to verify it passes**

Run: `go test ./internal/ai/ -v -run "RoleLimits"`
Expected: PASS for `TestPlanningRoleLimits` and `TestMatchingRoleLimits`.

- [ ] **Step 5: Verify and commit**

```bash
bash tools/verify.sh; echo "exit=$?"
git add internal/ai
git commit -m "ai: a matching role with its own output budget and timeouts"
```

---

### Task 3: The jobMatch task and the score math

**Files:**
- Create: `internal/app/match.go`
- Create: `internal/app/match_test.go`
- Modify: `internal/app/aitask_tasks_test.go` (schema checks)

**Interfaces:**
- Consumes: `settings.Settings` match fields (Task 1), `ai.RoleMatching` (Task 2), `clamp(v, lo, hi int) int` (already in `internal/app/window.go`), `textproc.Truncate`.
- Produces:
  - `type MatchFactor struct { Applicable bool; Score int; Note string }` (JSON `applicable`, `score`, `note`)
  - `type MatchFactors struct { ResumeFit, Seniority, Location, Salary MatchFactor }` (JSON `resumeFit`, `seniority`, `location`, `salary`)
  - `type MatchScore struct { Overall int; Factors MatchFactors; Strengths, Gaps []string; Provider, Model, ScoredAt string; Outdated bool; fingerprint string }` (JSON `overall`, `factors`, `strengths`, `gaps`, `provider`, `model`, `scoredAt`, `outdated`)
  - `func overallScore(f MatchFactors) int`
  - `func matchFingerprint(resume string, s settings.Settings) string`
  - `func matchTask(resume string, s settings.Settings, postings []Posting) ai.Task`
  - `var matchSchema map[string]any`
  - `type matchAnswer struct { Results []matchResult }`
  - `func matchScores(postings []Posting, ans matchAnswer) map[string]MatchScore` (no Provider/Model/ScoredAt set)

- [ ] **Step 1: Write the failing tests**

Create `internal/app/match_test.go`:

```go
// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

package app

import (
	"encoding/json"
	"strings"
	"testing"
	"unicode/utf8"

	"jobtrack/internal/ai"
	"jobtrack/internal/settings"
)

func factor(score int) MatchFactor { return MatchFactor{Applicable: true, Score: score} }

func TestOverallScore(t *testing.T) {
	na := MatchFactor{}
	cases := []struct {
		name string
		f    MatchFactors
		want int
	}{
		{"all four", MatchFactors{factor(80), factor(60), factor(100), factor(40)}, 73},           // (4000+1200+1500+600)/100
		{"no salary listed", MatchFactors{factor(80), factor(60), factor(100), na}, 79},           // 6700/85 = 78.8
		{"resume only", MatchFactors{factor(77), na, na, na}, 77},
		{"clamped", MatchFactors{factor(150), factor(-20), na, na}, 71},                           // (100*50+0*20)/70 = 71.4
		{"nothing applies", MatchFactors{na, na, na, na}, 0},
	}
	for _, c := range cases {
		if got := overallScore(c.f); got != c.want {
			t.Errorf("%s: got %d, want %d", c.name, got, c.want)
		}
	}
}

func TestMatchScoresClampsAndPairs(t *testing.T) {
	postings := []Posting{{ID: "a"}, {ID: "b"}, {ID: "c"}}
	var ans matchAnswer
	if err := json.Unmarshal([]byte(`{"results":[
		{"id":"a","resumeFit":{"score":130,"note":"strong Go"},"seniority":{"applicable":true,"score":-5,"note":"junior"},
		 "location":{"applicable":false,"score":0,"note":"not stated"},"salary":{"applicable":true,"score":50,"note":"near floor"},
		 "strengths":["Go"," ","Postgres","Kubernetes","AWS"],"gaps":["no Rust"]},
		{"id":"b","resumeFit":{"score":60,"note":""},"seniority":{"applicable":false,"score":0,"note":""},"location":{"applicable":false,"score":0,"note":""},"salary":{"applicable":false,"score":0,"note":""},"strengths":[],"gaps":[]},
		{"id":"b","resumeFit":{"score":61,"note":""},"seniority":{"applicable":false,"score":0,"note":""},"location":{"applicable":false,"score":0,"note":""},"salary":{"applicable":false,"score":0,"note":""},"strengths":[],"gaps":[]},
		{"id":"zzz","resumeFit":{"score":99,"note":""},"seniority":{"applicable":false,"score":0,"note":""},"location":{"applicable":false,"score":0,"note":""},"salary":{"applicable":false,"score":0,"note":""},"strengths":[],"gaps":[]}
	]}`), &ans); err != nil {
		t.Fatal(err)
	}
	got := matchScores(postings, ans)
	if len(got) != 1 {
		t.Fatalf("only a should be scored (b is duplicated, c missing, zzz invented): %v", got)
	}
	a := got["a"]
	if a.Factors.ResumeFit.Score != 100 || !a.Factors.ResumeFit.Applicable || a.Factors.Seniority.Score != 0 || a.Factors.Location.Applicable {
		t.Fatalf("factors = %+v", a.Factors)
	}
	// (100*50 + 0*20 + 50*15) / 85 = 67.6
	if a.Overall != 68 {
		t.Fatalf("overall = %d", a.Overall)
	}
	if strings.Join(a.Strengths, "|") != "Go|Postgres|Kubernetes" || strings.Join(a.Gaps, "|") != "no Rust" {
		t.Fatalf("strengths %q gaps %q", a.Strengths, a.Gaps)
	}
}

func TestMatchFingerprint(t *testing.T) {
	s := settings.Settings{MatchMinSalary: 100000, MatchWorkModes: []string{"remote", "hybrid"}, MatchLocations: "Denver", MatchSeniority: "senior", MatchGoals: "climate"}
	base := matchFingerprint("Jane Doe, Go", s)
	same := s
	same.MatchWorkModes = []string{"hybrid", "remote"}
	same.MatchLocations = "  Denver "
	same.MatchEnabled, same.MatchProvider, same.MatchPerRequest = true, settings.ProviderAnthropic, 40
	if matchFingerprint(" Jane Doe, Go\n", same) != base {
		t.Fatal("order, whitespace, the switch, the provider and the request size must not change the fingerprint")
	}
	changes := map[string]func(*settings.Settings, *string){
		"resume":    func(_ *settings.Settings, r *string) { *r = "Jane Doe, Rust" },
		"salary":    func(s *settings.Settings, _ *string) { s.MatchMinSalary = 90000 },
		"modes":     func(s *settings.Settings, _ *string) { s.MatchWorkModes = []string{"remote"} },
		"locations": func(s *settings.Settings, _ *string) { s.MatchLocations = "Boulder" },
		"seniority": func(s *settings.Settings, _ *string) { s.MatchSeniority = "staff" },
		"goals":     func(s *settings.Settings, _ *string) { s.MatchGoals = "health" },
	}
	for name, change := range changes {
		c, resume := s, "Jane Doe, Go"
		c.MatchWorkModes = append([]string(nil), s.MatchWorkModes...)
		change(&c, &resume)
		if matchFingerprint(resume, c) == base {
			t.Errorf("changing %s must change the fingerprint", name)
		}
	}
}

func TestMatchTaskInput(t *testing.T) {
	long := strings.Repeat("é", 2000)
	task := matchTask("Jane Doe", settings.Settings{MatchSeniority: "senior"}, []Posting{
		{ID: "p1", Title: "Go Dev", Company: "Acme", WorkMode: "remote", SalaryText: "$150k", Description: long},
		{ID: "p2", Title: "PM"},
	})
	if task.Name != "jobMatch" || task.Role != ai.RoleMatching || task.Instruction == "" {
		t.Fatalf("task = %+v", task)
	}
	var in struct {
		Candidate struct {
			Resume      string         `json:"resume"`
			Preferences map[string]any `json:"preferences"`
		} `json:"candidate"`
		Postings []map[string]string `json:"postings"`
	}
	if err := json.Unmarshal([]byte(task.Input), &in); err != nil {
		t.Fatalf("input isn't JSON: %v", err)
	}
	if in.Candidate.Resume != "Jane Doe" || in.Candidate.Preferences["seniority"] != "senior" || len(in.Candidate.Preferences) != 1 {
		t.Fatalf("candidate = %+v (unset preferences must be left out)", in.Candidate)
	}
	d := in.Postings[0]["description"]
	if !utf8.ValidString(d) || utf8.RuneCountInString(d) > 1501 || !strings.HasSuffix(d, "…") {
		t.Fatalf("description cut badly: %d runes", utf8.RuneCountInString(d))
	}
	if in.Postings[0]["salary"] != "$150k" || in.Postings[1]["id"] != "p2" || in.Postings[1]["company"] != "" {
		t.Fatalf("postings = %+v", in.Postings)
	}
}
```

Add to `internal/app/aitask_tasks_test.go`, inside `TestTaskSchemasAreStandardJSONSchema`:

```go
	checkStandardSchema(t, "jobMatch", matchSchema)
```

and to the `cases` map in `TestStrictCompatible`:

```go
		"jobMatch":      {matchSchema, true},
```

- [ ] **Step 2: Run to verify they fail**

Run: `go test ./internal/app/ -run "TestOverallScore|TestMatch|TestTaskSchemas|TestStrictCompatible" -v`
Expected: compile failure (`undefined: overallScore`, `matchScores`, …).

- [ ] **Step 3: Implement**

Create `internal/app/match.go`:

```go
// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

package app

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"math"
	"slices"
	"strconv"
	"strings"

	"jobtrack/internal/ai"
	"jobtrack/internal/settings"
	"jobtrack/internal/textproc"
)

// Match scores: how well a Discover posting fits the user's resume and
// preferences. The AI scores each factor; the overall % is computed here from
// fixed weights, so the same breakdown always gives the same number.

// Factor weights; they sum to 100.
const (
	weightResumeFit = 50
	weightSeniority = 20
	weightLocation  = 15
	weightSalary    = 15
)

const (
	matchDescriptionChars = 1500 // how much of each description is sent
	maxMatchReasons       = 3    // strengths and gaps kept per posting
)

// MatchFactor is one part of a match score. A factor that doesn't apply (no
// target set, or the posting doesn't say) is left out of the overall.
type MatchFactor struct {
	Applicable bool   `json:"applicable"`
	Score      int    `json:"score"` // 0-100
	Note       string `json:"note"`
}

type MatchFactors struct {
	ResumeFit MatchFactor `json:"resumeFit"` // always applicable; includes goals and deal-breakers
	Seniority MatchFactor `json:"seniority"`
	Location  MatchFactor `json:"location"` // work mode and location
	Salary    MatchFactor `json:"salary"`
}

// MatchScore is a posting's stored score. Outdated is set when listing: the
// score was graded against a different resume or preferences.
type MatchScore struct {
	Overall     int          `json:"overall"`
	Factors     MatchFactors `json:"factors"`
	Strengths   []string     `json:"strengths"`
	Gaps        []string     `json:"gaps"`
	Provider    string       `json:"provider"`
	Model       string       `json:"model"`
	ScoredAt    string       `json:"scoredAt"`
	Outdated    bool         `json:"outdated"`
	fingerprint string       // matchFingerprint at scoring time
}

// overallScore is the weighted average of the applicable factors, 0-100.
func overallScore(f MatchFactors) int {
	parts := []struct {
		f      MatchFactor
		weight int
	}{{f.ResumeFit, weightResumeFit}, {f.Seniority, weightSeniority}, {f.Location, weightLocation}, {f.Salary, weightSalary}}
	sum, weights := 0, 0
	for _, p := range parts {
		if p.f.Applicable {
			sum += clamp(p.f.Score, 0, 100) * p.weight
			weights += p.weight
		}
	}
	if weights == 0 {
		return 0
	}
	return int(math.Round(float64(sum) / float64(weights)))
}

// matchFingerprint identifies the resume and preferences a score was graded
// against. The switch, provider and request size don't affect it.
func matchFingerprint(resume string, s settings.Settings) string {
	modes := slices.Clone(s.MatchWorkModes)
	slices.Sort(modes)
	h := sha256.New()
	for _, part := range []string{strings.TrimSpace(resume), strconv.FormatInt(s.MatchMinSalary, 10), strings.Join(modes, ","),
		strings.TrimSpace(s.MatchLocations), s.MatchSeniority, strings.TrimSpace(s.MatchGoals)} {
		h.Write([]byte(part))
		h.Write([]byte{0})
	}
	return hex.EncodeToString(h.Sum(nil))
}

type matchPreferences struct {
	MinSalary int64    `json:"minSalary,omitempty"`
	WorkModes []string `json:"workModes,omitempty"`
	Locations string   `json:"locations,omitempty"`
	Seniority string   `json:"seniority,omitempty"`
	Goals     string   `json:"goals,omitempty"`
}

type matchPosting struct {
	ID          string `json:"id"`
	Title       string `json:"title"`
	Company     string `json:"company,omitempty"`
	Location    string `json:"location,omitempty"`
	WorkMode    string `json:"workMode,omitempty"`
	Salary      string `json:"salary,omitempty"`
	Description string `json:"description,omitempty"`
}

const matchInstruction = "You are a careful career advisor. For each job posting, judge how well it fits the candidate. " +
	"Score each factor from 0 to 100 with a one-line note: resumeFit (skills, experience and domain from the resume, plus the " +
	"candidate's goals), seniority (the role's level against the target), location (work mode and place against the candidate's " +
	"preferences) and salary (listed pay against the floor). Set applicable to false, with a note saying why, when the candidate " +
	"set no preference for that factor or the posting doesn't say. Treat goals and deal-breakers as part of resumeFit; a " +
	"deal-breaker the posting hits must lower resumeFit and appear in gaps. Give up to three strengths and three gaps, each a few " +
	"words. Return exactly one result per posting id. Use only facts from the resume and the postings."

// matchTask asks for scores for a group of postings in one request.
func matchTask(resume string, s settings.Settings, postings []Posting) ai.Task {
	in := struct {
		Candidate struct {
			Resume      string           `json:"resume"`
			Preferences matchPreferences `json:"preferences"`
		} `json:"candidate"`
		Postings []matchPosting `json:"postings"`
	}{}
	in.Candidate.Resume = strings.TrimSpace(resume)
	in.Candidate.Preferences = matchPreferences{MinSalary: s.MatchMinSalary, WorkModes: s.MatchWorkModes,
		Locations: strings.TrimSpace(s.MatchLocations), Seniority: s.MatchSeniority, Goals: strings.TrimSpace(s.MatchGoals)}
	in.Postings = make([]matchPosting, 0, len(postings))
	for _, p := range postings {
		in.Postings = append(in.Postings, matchPosting{ID: p.ID, Title: p.Title, Company: p.Company, Location: p.Location,
			WorkMode: p.WorkMode, Salary: p.SalaryText, Description: textproc.Truncate(strings.TrimSpace(p.Description), matchDescriptionChars)})
	}
	raw, _ := json.Marshal(in) // only strings, ints and slices: can't fail
	return ai.Task{Name: "jobMatch", Instruction: matchInstruction, Input: string(raw), Schema: matchSchema, Role: ai.RoleMatching}
}

var matchFactorSchema = map[string]any{
	"type": "object",
	"properties": map[string]any{
		"applicable": map[string]any{"type": "boolean"},
		"score":      map[string]any{"type": "integer"},
		"note":       map[string]any{"type": "string"},
	},
	"required":             []string{"applicable", "score", "note"},
	"additionalProperties": false,
}

var matchSchema = map[string]any{
	"type": "object",
	"properties": map[string]any{
		"results": map[string]any{"type": "array", "items": map[string]any{
			"type": "object",
			"properties": map[string]any{
				"id": map[string]any{"type": "string"},
				"resumeFit": map[string]any{
					"type":                 "object",
					"properties":           map[string]any{"score": map[string]any{"type": "integer"}, "note": map[string]any{"type": "string"}},
					"required":             []string{"score", "note"},
					"additionalProperties": false,
				},
				"seniority": matchFactorSchema,
				"location":  matchFactorSchema,
				"salary":    matchFactorSchema,
				"strengths": map[string]any{"type": "array", "items": map[string]any{"type": "string"}},
				"gaps":      map[string]any{"type": "array", "items": map[string]any{"type": "string"}},
			},
			"required":             []string{"id", "resumeFit", "seniority", "location", "salary", "strengths", "gaps"},
			"additionalProperties": false,
		}},
	},
	"required":             []string{"results"},
	"additionalProperties": false,
}

type matchAnswer struct {
	Results []matchResult `json:"results"`
}

type matchResult struct {
	ID        string `json:"id"`
	ResumeFit struct {
		Score int    `json:"score"`
		Note  string `json:"note"`
	} `json:"resumeFit"`
	Seniority MatchFactor `json:"seniority"`
	Location  MatchFactor `json:"location"`
	Salary    MatchFactor `json:"salary"`
	Strengths []string    `json:"strengths"`
	Gaps      []string    `json:"gaps"`
}

// matchScores pairs an answer with the postings asked about. A posting with no
// result, or more than one, is left out and stays unscored; results for IDs
// that weren't asked about are ignored.
func matchScores(postings []Posting, ans matchAnswer) map[string]MatchScore {
	count := map[string]int{}
	for _, res := range ans.Results {
		count[res.ID]++
	}
	out := map[string]MatchScore{}
	for _, res := range ans.Results {
		asked := slices.ContainsFunc(postings, func(p Posting) bool { return p.ID == res.ID })
		if !asked || count[res.ID] != 1 {
			continue
		}
		f := MatchFactors{
			ResumeFit: MatchFactor{Applicable: true, Score: clamp(res.ResumeFit.Score, 0, 100), Note: res.ResumeFit.Note},
			Seniority: clampFactor(res.Seniority),
			Location:  clampFactor(res.Location),
			Salary:    clampFactor(res.Salary),
		}
		out[res.ID] = MatchScore{Overall: overallScore(f), Factors: f, Strengths: firstReasons(res.Strengths), Gaps: firstReasons(res.Gaps)}
	}
	return out
}

func clampFactor(f MatchFactor) MatchFactor {
	f.Score = clamp(f.Score, 0, 100)
	return f
}

// firstReasons keeps up to maxMatchReasons non-blank entries; never nil.
func firstReasons(list []string) []string {
	out := []string{}
	for _, s := range list {
		if s = strings.TrimSpace(s); s != "" && len(out) < maxMatchReasons {
			out = append(out, s)
		}
	}
	return out
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `go test ./internal/app/ -run "TestOverallScore|TestMatch|TestTaskSchemas|TestStrictCompatible" -v`
Expected: PASS.

- [ ] **Step 5: Verify and commit**

```bash
bash tools/verify.sh; echo "exit=$?"
git add internal/app/match.go internal/app/match_test.go internal/app/aitask_tasks_test.go
git commit -m "match: the jobMatch task, answer pairing and weighted overall score"
```

---

### Task 4: Storing scores and showing them on postings

**Files:**
- Modify: `internal/app/db.go` (append migration 10)
- Create: `internal/app/match_store.go`
- Modify: `internal/app/postings.go` (`Posting.Match`, `postingColumns`, `postingFrom`, `scanPosting`)
- Modify: `internal/app/app.go` (`ListPostings` marks outdated; new `matchFingerprint` helper)
- Test: `internal/app/match_store_test.go`

**Interfaces:**
- Consumes: `MatchScore`, `matchFingerprint` (Task 3).
- Produces:
  - `func (r *Repo) saveMatchScore(postingID string, m MatchScore, fingerprint string) error`: insert or replace; a missing posting is skipped silently.
  - `Posting.Match *MatchScore` (JSON `match`, omitted when unscored), filled by every query that uses `postingColumns`/`postingFrom`.
  - `func markOutdated(postings []Posting, fingerprint string)`
  - `func (a *App) currentMatchFingerprint() (string, error)`
  - test helper `addPostings(t, r, titles...) []Posting` in `match_store_test.go` (used again in Task 5).

- [ ] **Step 1: Write the failing tests**

Create `internal/app/match_store_test.go`:

```go
// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

package app

import (
	"testing"

	"jobtrack/internal/discover"
)

// addPostings stores one inbox posting per title and returns them newest first.
func addPostings(t *testing.T, r *Repo, titles ...string) []Posting {
	t.Helper()
	var results []discover.DiscoverResult
	for _, title := range titles {
		results = append(results, discover.FromRaw(discover.RawJob{Title: title, Company: "Acme", URL: "https://acme.test/" + title, Description: "Build Go services"}, "indeed"))
	}
	if _, err := r.UpsertPostings(results, ""); err != nil {
		t.Fatal(err)
	}
	ps, err := r.ListPostings(PostingFilter{Tab: "inbox"})
	if err != nil {
		t.Fatal(err)
	}
	return ps
}

func sampleScore(overall int) MatchScore {
	f := MatchFactors{ResumeFit: factor(overall), Salary: MatchFactor{Note: "no salary listed"}}
	return MatchScore{Overall: overall, Factors: f, Strengths: []string{"Go"}, Gaps: []string{}, Provider: "anthropic", Model: "claude-opus-5-5"}
}

func TestSaveAndListMatchScores(t *testing.T) {
	r := newTestRepo(t)
	ps := addPostings(t, r, "Go Dev", "PM")
	if ps[0].Match != nil {
		t.Fatal("a new posting has no score")
	}
	if err := r.saveMatchScore(ps[0].ID, sampleScore(81), "fp1"); err != nil {
		t.Fatal(err)
	}
	if err := r.saveMatchScore(ps[0].ID, sampleScore(64), "fp2"); err != nil { // re-score replaces
		t.Fatal(err)
	}
	got, err := r.GetPosting(ps[0].ID)
	if err != nil || got.Match == nil {
		t.Fatalf("got %+v, %v", got, err)
	}
	m := got.Match
	if m.Overall != 64 || m.fingerprint != "fp2" || m.Provider != "anthropic" || m.Model != "claude-opus-5-5" || m.ScoredAt == "" ||
		m.Factors.Salary.Note != "no salary listed" || len(m.Strengths) != 1 || m.Gaps == nil {
		t.Fatalf("match = %+v", m)
	}
	var rows int
	r.db.QueryRow(`SELECT COUNT(*) FROM posting_scores`).Scan(&rows)
	if rows != 1 {
		t.Fatalf("rows = %d, want 1 (replaced, not added)", rows)
	}
}

func TestSaveMatchScoreSkipsDeletedPosting(t *testing.T) {
	r := newTestRepo(t)
	ps := addPostings(t, r, "Go Dev")
	r.db.Exec(`DELETE FROM postings WHERE id = ?`, ps[0].ID)
	if err := r.saveMatchScore(ps[0].ID, sampleScore(70), "fp"); err != nil {
		t.Fatalf("a posting deleted mid-run must be skipped, got %v", err)
	}
	var rows int
	r.db.QueryRow(`SELECT COUNT(*) FROM posting_scores`).Scan(&rows)
	if rows != 0 {
		t.Fatalf("rows = %d", rows)
	}
}

func TestDeletingPostingDeletesScore(t *testing.T) {
	r := newTestRepo(t)
	ps := addPostings(t, r, "Go Dev")
	r.saveMatchScore(ps[0].ID, sampleScore(70), "fp")
	if _, err := r.db.Exec(`DELETE FROM postings WHERE id = ?`, ps[0].ID); err != nil {
		t.Fatal(err)
	}
	var rows int
	r.db.QueryRow(`SELECT COUNT(*) FROM posting_scores`).Scan(&rows)
	if rows != 0 {
		t.Fatalf("score should go with its posting, rows = %d", rows)
	}
}

func TestMarkOutdated(t *testing.T) {
	ps := []Posting{{ID: "a", Match: &MatchScore{fingerprint: "old"}}, {ID: "b", Match: &MatchScore{fingerprint: "now"}}, {ID: "c"}}
	markOutdated(ps, "now")
	if !ps[0].Match.Outdated || ps[1].Match.Outdated || ps[2].Match != nil {
		t.Fatalf("ps = %+v %+v %+v", ps[0].Match, ps[1].Match, ps[2].Match)
	}
}

func TestAppListPostingsFlagsOutdatedScores(t *testing.T) {
	a := NewApp(t.TempDir())
	if a.initErr != nil {
		t.Fatal(a.initErr)
	}
	a.repo.UpdateResumeText("Jane Doe, Go")
	ps := addPostings(t, a.repo, "Go Dev")
	fp, err := a.currentMatchFingerprint()
	if err != nil {
		t.Fatal(err)
	}
	a.repo.saveMatchScore(ps[0].ID, sampleScore(80), fp)
	list, _ := a.ListPostings(PostingFilter{Tab: "inbox"})
	if list[0].Match == nil || list[0].Match.Outdated {
		t.Fatalf("fresh score shown as outdated: %+v", list[0].Match)
	}
	a.repo.UpdateResumeText("Jane Doe, Rust")
	list, _ = a.ListPostings(PostingFilter{Tab: "inbox"})
	if !list[0].Match.Outdated {
		t.Fatal("a resume change must mark the score outdated")
	}
}
```

- [ ] **Step 2: Run to verify they fail**

Run: `go test ./internal/app/ -run "TestSaveAndList|TestSaveMatchScore|TestDeletingPosting|TestMarkOutdated|TestAppListPostings" -v`
Expected: compile failure (`saveMatchScore`, `Posting.Match`, `markOutdated`, `currentMatchFingerprint` undefined).

- [ ] **Step 3: Implement**

`internal/app/db.go`, append to `migrations` (after migration 9):

```go
	// 10: match scores for Discover postings, one per posting (see match.go).
	`CREATE TABLE posting_scores (
		posting_id TEXT PRIMARY KEY REFERENCES postings(id) ON DELETE CASCADE,
		overall INTEGER NOT NULL,
		factors TEXT NOT NULL,
		strengths TEXT NOT NULL,
		gaps TEXT NOT NULL,
		fingerprint TEXT NOT NULL,
		provider TEXT NOT NULL,
		model TEXT NOT NULL DEFAULT '',
		scored_at TEXT NOT NULL
	);`,
```

Create `internal/app/match_store.go`:

```go
// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

package app

import (
	"database/sql"
	"encoding/json"
)

// saveMatchScore stores (or replaces) a posting's score. A posting deleted
// while it was being scored is skipped, not an error.
func (r *Repo) saveMatchScore(postingID string, m MatchScore, fingerprint string) error {
	factors, _ := json.Marshal(m.Factors)
	strengths, _ := json.Marshal(m.Strengths)
	gaps, _ := json.Marshal(m.Gaps)
	_, err := r.db.Exec(`INSERT OR REPLACE INTO posting_scores (posting_id, overall, factors, strengths, gaps, fingerprint, provider, model, scored_at)
		SELECT id, ?, ?, ?, ?, ?, ?, ?, ? FROM postings WHERE id = ?`,
		m.Overall, string(factors), string(strengths), string(gaps), fingerprint, m.Provider, m.Model, ts(r.now()), postingID)
	return err
}

// matchColumns are appended to postingColumns; scanMatch reads them back.
const matchColumns = `, ms.overall, ms.factors, ms.strengths, ms.gaps, ms.fingerprint, ms.provider, ms.model, ms.scored_at`

// matchCells receives matchColumns from a row.
type matchCells struct {
	overall                                                       sql.NullInt64
	factors, strengths, gaps, fingerprint, provider, model, scored sql.NullString
}

func (c *matchCells) dests() []any {
	return []any{&c.overall, &c.factors, &c.strengths, &c.gaps, &c.fingerprint, &c.provider, &c.model, &c.scored}
}

// score is nil for an unscored posting.
func (c *matchCells) score() *MatchScore {
	if !c.overall.Valid {
		return nil
	}
	m := &MatchScore{Overall: int(c.overall.Int64), Provider: c.provider.String, Model: c.model.String, ScoredAt: c.scored.String, fingerprint: c.fingerprint.String}
	json.Unmarshal([]byte(c.factors.String), &m.Factors)
	json.Unmarshal([]byte(c.strengths.String), &m.Strengths)
	json.Unmarshal([]byte(c.gaps.String), &m.Gaps)
	return m
}

// markOutdated flags scores graded against another resume or preferences.
func markOutdated(postings []Posting, fingerprint string) {
	for i := range postings {
		if m := postings[i].Match; m != nil {
			m.Outdated = m.fingerprint != fingerprint
		}
	}
}
```

`internal/app/postings.go`:

Add to `Posting` (after `DismissedAt`):

```go
	Match       *MatchScore `json:"match,omitempty"` // nil until scored
```

Change the column and join constants:

```go
const postingColumns = `p.id, p.dedupe_key, p.url, p.title, p.company, p.location, p.work_mode, p.salary_min, p.salary_max,
	p.salary_text, p.annualized, p.description, p.date_posted, p.sources, p.state, p.job_id, p.search_id,
	p.first_seen, p.last_seen, p.dismissed_at, COALESCE(j.status, '')` + matchColumns

const postingFrom = ` FROM postings p LEFT JOIN jobs j ON j.id = p.job_id LEFT JOIN posting_scores ms ON ms.posting_id = p.id `
```

In `scanPosting`, read the match columns:

```go
func scanPosting(s rowScanner) (Posting, error) {
	var p Posting
	var lo, hi sql.NullInt64
	var sources string
	var jobID, searchID sql.NullString
	var match matchCells
	err := s.Scan(append([]any{&p.ID, &p.DedupeKey, &p.URL, &p.Title, &p.Company, &p.Location, &p.WorkMode, &lo, &hi,
		&p.SalaryText, &p.Annualized, &p.Description, &p.DatePosted, &sources, &p.State, &jobID, &searchID,
		&p.FirstSeen, &p.LastSeen, &p.DismissedAt, &p.JobStatus}, match.dests()...)...)
	if lo.Valid {
		p.SalaryMin = &lo.Int64
	}
	if hi.Valid {
		p.SalaryMax = &hi.Int64
	}
	p.Sources = splitSources(sources)
	p.JobID, p.SearchID = jobID.String, searchID.String
	p.Match = match.score()
	return p, err
}
```

`internal/app/app.go`, replace `ListPostings` and add the fingerprint helper:

```go
// ListPostings returns a tab's postings, with each match score flagged if it
// was graded against an older resume or preferences.
func (a *App) ListPostings(f PostingFilter) ([]Posting, error) {
	postings, err := a.repo.ListPostings(f)
	if err != nil {
		return nil, err
	}
	fingerprint, err := a.currentMatchFingerprint()
	if err != nil {
		return nil, err
	}
	markOutdated(postings, fingerprint)
	return postings, nil
}

// currentMatchFingerprint identifies the resume and preferences new scores are graded against.
func (a *App) currentMatchFingerprint() (string, error) {
	s, err := a.settings.Load()
	if err != nil {
		return "", err
	}
	profile, err := a.repo.GetProfile()
	if err != nil {
		return "", err
	}
	return matchFingerprint(profile.ResumeText, s), nil
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `go test ./internal/app/ -v -run "TestSaveAndList|TestSaveMatchScore|TestDeletingPosting|TestMarkOutdated|TestAppListPostings|Posting|Migration"`
Expected: PASS. Then the whole package: `go test ./internal/app/` → `ok`.

- [ ] **Step 5: Regenerate, verify, commit**

```bash
wails generate module
bash tools/verify.sh; echo "exit=$?"
git add internal/app frontend/wailsjs
git commit -m "match: store one score per posting and flag outdated scores"
```

---

### Task 5: Scoring runs, App methods and progress events

**Files:**
- Create: `internal/app/match_run.go`
- Create: `internal/app/match_run_test.go`
- Modify: `internal/app/searches.go` (add `withProgress`)
- Modify: `internal/app/searches_test.go` (test `withProgress`)
- Modify: `internal/app/app.go` (`matchMu`, `emit`, `ScoreInbox`, `RescoreOutdated`, `ScorePosting`, progress in `RunSearch`/`RefreshSearch`)

**Interfaces:**
- Consumes: `matchTask`, `matchScores`, `matchFingerprint` (Task 3); `saveMatchScore`, `Posting.Match`, `addPostings`, `sampleScore` (Task 4); `ai.RunTask`, `ai.ListAIProviders`; `aitest.FakeAnthropic`, `aitest.AnthropicReply`, `aitest.AnthropicSettings`.
- Produces:
  - `type MatchRun struct { Scored, Failed, Total int; Error string }` (JSON `scored`, `failed`, `total`, `error`)
  - `func (r *Repo) matchCandidates(want func(Posting) bool) ([]Posting, error)`: inbox and saved, newest first
  - `func runMatch(ctx context.Context, r *Repo, s settings.Settings, resume string, postings []Posting, progress func(done, total int)) (MatchRun, error)`
  - `func withProgress(fetch sourceFunc, total int, report func(done, total int)) sourceFunc`
  - Wails-bound: `ScoreInbox() (MatchRun, error)`, `RescoreOutdated() (MatchRun, error)`, `ScorePosting(id string) (MatchRun, error)`
  - Events: `search:progress` and `match:progress`, both with payload `{"done": int, "total": int}`.

- [ ] **Step 1: Write the failing tests**

Create `internal/app/match_run_test.go`:

```go
// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

package app

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"sync/atomic"
	"testing"

	"jobtrack/internal/ai/aitest"
	"jobtrack/internal/settings"
)

// requestedIDs finds the posting IDs in an Anthropic request body: the task's
// input is the text of the first user message.
func requestedIDs(t *testing.T, body []byte) []string {
	t.Helper()
	var req struct {
		Messages []struct {
			Content []struct {
				Text string `json:"text"`
			} `json:"content"`
		} `json:"messages"`
	}
	if err := json.Unmarshal(body, &req); err != nil || len(req.Messages) == 0 || len(req.Messages[0].Content) == 0 {
		t.Fatalf("unexpected request: %s", body)
	}
	var in struct {
		Postings []struct {
			ID string `json:"id"`
		} `json:"postings"`
	}
	json.Unmarshal([]byte(req.Messages[0].Content[0].Text), &in)
	var ids []string
	for _, p := range in.Postings {
		ids = append(ids, p.ID)
	}
	return ids
}

// matchReply is an Anthropic answer scoring each ID 80 on resume fit only.
func matchReply(ids []string) []byte {
	var results []string
	for _, id := range ids {
		results = append(results, fmt.Sprintf(`{"id":%q,"resumeFit":{"score":80,"note":"good"},"seniority":{"applicable":false,"score":0,"note":"no target"},`+
			`"location":{"applicable":false,"score":0,"note":"no preference"},"salary":{"applicable":false,"score":0,"note":"no floor"},"strengths":["Go"],"gaps":[]}`, id))
	}
	return aitest.AnthropicReply("claude-opus-5-5", `{"results":[`+strings.Join(results, ",")+`]}`, "end_turn")
}

func matchSettings(perRequest int) settings.Settings {
	s := aitest.AnthropicSettings
	s.MatchProvider, s.MatchPerRequest = settings.ProviderAnthropic, perRequest
	return s
}

type progressLog struct{ calls []string }

func (l *progressLog) report(done, total int) { l.calls = append(l.calls, fmt.Sprintf("%d/%d", done, total)) }

func TestRunMatchScoresInGroups(t *testing.T) {
	r := newTestRepo(t)
	ps := addPostings(t, r, "A", "B", "C", "D", "E")
	var requests atomic.Int32
	aitest.FakeAnthropic(t, func(w http.ResponseWriter, req *http.Request) {
		requests.Add(1)
		body, _ := io.ReadAll(req.Body)
		w.Header().Set("Content-Type", "application/json")
		w.Write(matchReply(requestedIDs(t, body)))
	})
	var log progressLog
	s := matchSettings(2)
	run, err := runMatch(context.Background(), r, s, "Jane Doe, Go", ps, log.report)
	if err != nil || run.Scored != 5 || run.Failed != 0 || run.Total != 5 || run.Error != "" {
		t.Fatalf("run = %+v, %v", run, err)
	}
	if requests.Load() != 3 || strings.Join(log.calls, " ") != "2/5 4/5 5/5" {
		t.Fatalf("requests = %d, progress = %v", requests.Load(), log.calls)
	}
	got, _ := r.GetPosting(ps[4].ID)
	if got.Match == nil || got.Match.Overall != 80 || got.Match.Provider != settings.ProviderAnthropic || got.Match.Model != "claude-opus-5-5" ||
		got.Match.fingerprint != matchFingerprint("Jane Doe, Go", s) {
		t.Fatalf("match = %+v", got.Match)
	}
}

func TestRunMatchStopsAtFailedRequest(t *testing.T) {
	r := newTestRepo(t)
	ps := addPostings(t, r, "A", "B", "C", "D", "E")
	var requests atomic.Int32
	aitest.FakeAnthropic(t, func(w http.ResponseWriter, req *http.Request) {
		body, _ := io.ReadAll(req.Body)
		w.Header().Set("Content-Type", "application/json")
		if requests.Add(1) == 2 {
			w.WriteHeader(http.StatusUnauthorized)
			w.Write([]byte(`{"type":"error","error":{"type":"authentication_error","message":"invalid x-api-key"}}`))
			return
		}
		w.Write(matchReply(requestedIDs(t, body)))
	})
	run, err := runMatch(context.Background(), r, matchSettings(2), "Jane Doe", ps, func(int, int) {})
	if err != nil || run.Scored != 2 || run.Failed != 2 || run.Total != 5 || !strings.HasPrefix(run.Error, "Scoring stopped: ") || !strings.Contains(run.Error, "API key") {
		t.Fatalf("run = %+v, %v", run, err)
	}
	if requests.Load() != 2 {
		t.Fatalf("requests = %d: the run must stop at the first failure", requests.Load())
	}
}

func TestRunMatchPartialAnswer(t *testing.T) {
	r := newTestRepo(t)
	ps := addPostings(t, r, "A", "B")
	aitest.FakeAnthropic(t, func(w http.ResponseWriter, req *http.Request) {
		body, _ := io.ReadAll(req.Body)
		w.Header().Set("Content-Type", "application/json")
		w.Write(matchReply(requestedIDs(t, body)[:1]))
	})
	run, err := runMatch(context.Background(), r, matchSettings(5), "Jane Doe", ps, func(int, int) {})
	if err != nil || run.Scored != 1 || run.Failed != 1 || run.Error != "" {
		t.Fatalf("run = %+v, %v", run, err)
	}
}

func TestRunMatchSkipsPostingDeletedMidRun(t *testing.T) {
	r := newTestRepo(t)
	ps := addPostings(t, r, "A", "B")
	aitest.FakeAnthropic(t, func(w http.ResponseWriter, req *http.Request) {
		body, _ := io.ReadAll(req.Body)
		r.db.Exec(`DELETE FROM postings WHERE id = ?`, ps[0].ID) // e.g. "Clear older than 90 days" meanwhile
		w.Header().Set("Content-Type", "application/json")
		w.Write(matchReply(requestedIDs(t, body)))
	})
	run, err := runMatch(context.Background(), r, matchSettings(5), "Jane Doe", ps, func(int, int) {})
	if err != nil || run.Error != "" {
		t.Fatalf("run = %+v, %v", run, err)
	}
	if got, _ := r.GetPosting(ps[1].ID); got.Match == nil {
		t.Fatal("the other posting should still be scored")
	}
}

func TestRunMatchSafeguards(t *testing.T) {
	r := newTestRepo(t)
	ps := addPostings(t, r, "A")
	var requests atomic.Int32
	aitest.FakeAnthropic(t, func(w http.ResponseWriter, req *http.Request) { requests.Add(1) })

	run, _ := runMatch(context.Background(), r, matchSettings(5), "Jane", nil, func(int, int) {})
	if run.Total != 0 || run.Error != "" {
		t.Fatalf("nothing to score: %+v", run)
	}
	run, _ = runMatch(context.Background(), r, matchSettings(5), "  \n\t ", ps, func(int, int) {})
	if run.Error != "Add your resume on the Profile page to get match scores" {
		t.Fatalf("blank resume: %+v", run)
	}
	noKey := matchSettings(5)
	noKey.AnthropicKey = ""
	run, _ = runMatch(context.Background(), r, noKey, "Jane", ps, func(int, int) {})
	if !strings.HasPrefix(run.Error, "Job matching: ") || !strings.Contains(run.Error, "Anthropic") {
		t.Fatalf("provider not set up: %+v", run)
	}
	if requests.Load() != 0 {
		t.Fatalf("safeguards must send no request, sent %d", requests.Load())
	}
}

func TestMatchCandidates(t *testing.T) {
	r := newTestRepo(t)
	ps := addPostings(t, r, "A", "B", "C")
	r.saveMatchScore(ps[0].ID, sampleScore(70), "fp")
	if err := r.DismissPosting(ps[1].ID); err != nil {
		t.Fatal(err)
	}
	got, err := r.matchCandidates(func(p Posting) bool { return p.Match == nil })
	if err != nil || len(got) != 1 || got[0].ID != ps[2].ID {
		t.Fatalf("got %v, %v (scored and dismissed postings are skipped)", got, err)
	}
}

func TestScoreInboxOneRunAtATime(t *testing.T) {
	a := NewApp(t.TempDir())
	if a.initErr != nil {
		t.Fatal(a.initErr)
	}
	a.matchMu.Lock()
	defer a.matchMu.Unlock()
	run, err := a.ScoreInbox()
	if err != nil || run.Error != "Scoring is already running" {
		t.Fatalf("run = %+v, %v", run, err)
	}
}
```

Add to `internal/app/searches_test.go`:

```go
func TestWithProgressCountsFinishedBoards(t *testing.T) {
	var seen []string
	fetch := withProgress(func(context.Context, string, discover.DiscoverQuery, discover.FetchOptions) ([]discover.RawJob, error) {
		return nil, errors.New("board down")
	}, 2, func(done, total int) { seen = append(seen, fmt.Sprintf("%d/%d", done, total)) })
	fetch(context.Background(), "indeed", discover.DiscoverQuery{}, discover.FetchOptions{})
	fetch(context.Background(), "linkedin", discover.DiscoverQuery{}, discover.FetchOptions{})
	if strings.Join(seen, " ") != "1/2 2/2" {
		t.Fatalf("seen = %v (a failed board still counts as finished)", seen)
	}
}
```

(add `fmt` and the `discover` import to `searches_test.go` if `goimports` doesn't.)

- [ ] **Step 2: Run to verify they fail**

Run: `go test ./internal/app/ -run "TestRunMatch|TestMatchCandidates|TestScoreInbox|TestWithProgress" -v`
Expected: compile failure (`runMatch`, `matchCandidates`, `withProgress`, `matchMu`, `ScoreInbox` undefined).

- [ ] **Step 3: Implement**

Create `internal/app/match_run.go`:

```go
// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

package app

import (
	"context"
	"fmt"
	"slices"
	"strings"

	"jobtrack/internal/ai"
	"jobtrack/internal/settings"
)

// MatchRun is the outcome of one scoring run. Error explains why it didn't
// start or where it stopped, in words for the status line.
type MatchRun struct {
	Scored int    `json:"scored"`
	Failed int    `json:"failed"`
	Total  int    `json:"total"`
	Error  string `json:"error"`
}

// matchCandidates returns the inbox and Interested postings that want picks, newest first.
func (r *Repo) matchCandidates(want func(Posting) bool) ([]Posting, error) {
	var out []Posting
	for _, tab := range []string{"inbox", "saved"} {
		postings, err := r.ListPostings(PostingFilter{Tab: tab})
		if err != nil {
			return nil, err
		}
		for _, p := range postings {
			if want(p) {
				out = append(out, p)
			}
		}
	}
	slices.SortStableFunc(out, func(a, b Posting) int { return strings.Compare(b.FirstSeen, a.FirstSeen) })
	return out, nil
}

// runMatch scores postings with s.MatchProvider, s.MatchPerRequest per request,
// one request after another, calling progress after each. It stops at the first
// failed request: a bad key or a rate limit then costs one request, not one per
// group. Problems the user can fix go in MatchRun.Error; the returned error is
// for database failures.
func runMatch(ctx context.Context, r *Repo, s settings.Settings, resume string, postings []Posting, progress func(done, total int)) (MatchRun, error) {
	settings.ApplyDefaults(&s)
	run := MatchRun{Total: len(postings)}
	if len(postings) == 0 {
		return run, nil
	}
	if strings.TrimSpace(resume) == "" {
		run.Error = "Add your resume on the Profile page to get match scores"
		return run, nil
	}
	if reason := providerUnavailable(s, s.MatchProvider); reason != "" {
		run.Error = "Job matching: " + reason
		return run, nil
	}
	fingerprint := matchFingerprint(resume, s)
	done := 0
	for group := range slices.Chunk(postings, s.MatchPerRequest) {
		var ans matchAnswer
		model, err := ai.RunTask(ctx, s, s.MatchProvider, matchTask(resume, s, group), &ans)
		if err != nil {
			run.Failed += len(group)
			run.Error = "Scoring stopped: " + err.Error()
			return run, nil
		}
		scores := matchScores(group, ans)
		for _, p := range group {
			m, ok := scores[p.ID]
			if !ok {
				run.Failed++
				continue
			}
			m.Provider, m.Model = s.MatchProvider, model
			if err := r.saveMatchScore(p.ID, m, fingerprint); err != nil {
				return run, err
			}
			run.Scored++
		}
		done += len(group)
		progress(done, len(postings))
	}
	return run, nil
}

// providerUnavailable is the provider's own setup reason, "" when it's ready.
func providerUnavailable(s settings.Settings, id string) string {
	for _, p := range ai.ListAIProviders(s) {
		if p.ID == id {
			return p.Unavailable
		}
	}
	return fmt.Sprintf("unknown AI provider %q", id)
}
```

Add to `internal/app/searches.go` (after `runDiscover`):

```go
// withProgress wraps fetch so report hears each time a board finishes,
// whether it found postings or failed.
func withProgress(fetch sourceFunc, total int, report func(done, total int)) sourceFunc {
	var done atomic.Int32
	return func(ctx context.Context, source string, q discover.DiscoverQuery, opts discover.FetchOptions) ([]discover.RawJob, error) {
		jobs, err := fetch(ctx, source, q, opts)
		report(int(done.Add(1)), total)
		return jobs, err
	}
}
```

(`sync/atomic` import.)

In `internal/app/app.go`:

Add a field to `App`:

```go
	matchMu     sync.Mutex // one scoring run at a time
```

Add the methods:

```go
// emit sends an event to the frontend; it does nothing before startup (and in tests).
func (a *App) emit(name string, data any) {
	if a.ctx != nil {
		runtime.EventsEmit(a.ctx, name, data)
	}
}

func (a *App) reportProgress(event string) func(done, total int) {
	return func(done, total int) { a.emit(event, map[string]int{"done": done, "total": total}) }
}

// ScoreInbox scores every inbox and Interested posting that has no match score yet.
func (a *App) ScoreInbox() (MatchRun, error) {
	return a.scoreMatches(func(p Posting, _ string) bool { return p.Match == nil })
}

// RescoreOutdated scores again the postings graded against an older resume or preferences.
func (a *App) RescoreOutdated() (MatchRun, error) {
	return a.scoreMatches(func(p Posting, fingerprint string) bool { return p.Match != nil && p.Match.fingerprint != fingerprint })
}

// ScorePosting scores one posting, or scores it again.
func (a *App) ScorePosting(id string) (MatchRun, error) {
	return a.scoreMatches(func(p Posting, _ string) bool { return p.ID == id })
}

func (a *App) scoreMatches(want func(p Posting, fingerprint string) bool) (MatchRun, error) {
	if !a.matchMu.TryLock() {
		return MatchRun{Error: "Scoring is already running"}, nil
	}
	defer a.matchMu.Unlock()
	s, err := a.settings.Load()
	if err != nil {
		return MatchRun{}, err
	}
	profile, err := a.repo.GetProfile()
	if err != nil {
		return MatchRun{}, err
	}
	fingerprint := matchFingerprint(profile.ResumeText, s)
	postings, err := a.repo.matchCandidates(func(p Posting) bool { return want(p, fingerprint) })
	if err != nil {
		return MatchRun{}, err
	}
	return runMatch(a.aiContext(), a.repo, s, profile.ResumeText, postings, a.reportProgress("match:progress"))
}
```

In `RunSearch` and `RefreshSearch`, pass a progress-reporting fetch:

```go
func (a *App) RunSearch(q SearchQuery) (SearchRun, error) {
	settings, err := a.settings.Load()
	if err != nil {
		return SearchRun{}, err
	}
	fetcher := sourceFetcher{settings: settings, repo: a.repo}
	fetch := withProgress(fetcher.fetch, len(normalizeSources(q.Sources)), a.reportProgress("search:progress"))
	return RunSearch(context.Background(), a.repo, q, settings, fetch)
}
```

(and the same three-line change in `RefreshSearch`, calling `RefreshSearch(context.Background(), a.repo, q, fetch)`.)

- [ ] **Step 4: Run to verify they pass**

Run: `go test ./internal/app/ -run "TestRunMatch|TestMatchCandidates|TestScoreInbox|TestWithProgress" -v`
Expected: PASS. Then `go test ./...` → all `ok`.

- [ ] **Step 5: Regenerate, verify, commit**

```bash
wails generate module
bash tools/verify.sh; echo "exit=$?"
git add internal/app frontend/wailsjs
git commit -m "match: scoring runs (grouped, sequential, stop on failure), App methods and progress events"
```

---

### Task 6: Frontend match logic

**Files:**
- Create: `frontend/src/lib/match.ts`
- Create: `frontend/src/lib/match.test.ts`
- Modify: `frontend/src/lib/backend.ts` (export `EventsOn`)

**Interfaces:**
- Consumes: generated `app.Posting.match?: app.MatchScore`, `app.MatchRun`, `app.SearchRun` (`cached`, `newCount`), `settings.Settings.matchEnabled` (Tasks 1, 4, 5).
- Produces (all exported from `lib/match.ts`):
  - `type MatchBand = 'good' | 'fair' | 'low'`, `matchBand(overall: number): MatchBand`
  - `MATCH_FACTORS` (key, label, weight in display order)
  - `type FactorRow = { label: string; weight: number; applicable: boolean; score: number; note: string }`, `factorRows(m: app.MatchScore): FactorRow[]`
  - `sortByMatch(postings: app.Posting[]): app.Posting[]`
  - `shouldAutoScore(s: settings.Settings | undefined, run: app.SearchRun): boolean`
  - `searchStatus(boards: string[], done: number, total: number): string`, `scoringStatus(done: number, total: number): string`
  - `outdatedCount(postings: app.Posting[] | undefined): number`

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/lib/match.test.ts`:

```ts
// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from 'vitest'
import type { app, settings } from './backend'
import { factorRows, matchBand, outdatedCount, scoringStatus, searchStatus, shouldAutoScore, sortByMatch } from './match'

const f = (applicable: boolean, score: number, note = '') => ({ applicable, score, note })
const score = (overall: number, outdated = false) =>
  ({
    overall,
    outdated,
    factors: { resumeFit: f(true, overall, 'Go'), seniority: f(true, 60, 'senior'), location: f(false, 0, 'no preference'), salary: f(false, 0, 'no salary listed') },
    strengths: [],
    gaps: [],
    provider: 'anthropic',
    model: 'claude-opus-5-5',
    scoredAt: '2026-10-08T15:42:00.000Z',
  }) as unknown as app.MatchScore
const posting = (id: string, overall?: number, outdated = false) => ({ id, match: overall === undefined ? undefined : score(overall, outdated) }) as app.Posting

describe('matchBand', () => {
  it('splits at 80 and 60', () => {
    expect(matchBand(100)).toBe('good')
    expect(matchBand(80)).toBe('good')
    expect(matchBand(79)).toBe('fair')
    expect(matchBand(60)).toBe('fair')
    expect(matchBand(59)).toBe('low')
    expect(matchBand(0)).toBe('low')
  })
})

describe('factorRows', () => {
  it('lists the four factors with weights, keeping not-applicable ones', () => {
    const rows = factorRows(score(84))
    expect(rows.map((r) => `${r.label}:${r.weight}:${r.applicable}`)).toEqual([
      'Resume fit:50:true',
      'Seniority:20:true',
      'Work mode & location:15:false',
      'Salary:15:false',
    ])
    expect(rows[3].note).toBe('no salary listed')
  })
})

describe('sortByMatch', () => {
  it('puts scored postings first, highest first, then unscored in their order', () => {
    const sorted = sortByMatch([posting('u1'), posting('a', 62), posting('u2'), posting('b', 91), posting('c', 62)])
    expect(sorted.map((p) => p.id)).toEqual(['b', 'a', 'c', 'u1', 'u2'])
  })
})

describe('shouldAutoScore', () => {
  const on = { matchEnabled: true } as settings.Settings
  const run = (cached: boolean, newCount: number) => ({ cached, newCount }) as app.SearchRun
  it('scores only after a real search that found new postings, with scoring on', () => {
    expect(shouldAutoScore(on, run(false, 3))).toBe(true)
    expect(shouldAutoScore(on, run(true, 3))).toBe(false)
    expect(shouldAutoScore(on, run(false, 0))).toBe(false)
    expect(shouldAutoScore({ matchEnabled: false } as settings.Settings, run(false, 3))).toBe(false)
    expect(shouldAutoScore(undefined, run(false, 3))).toBe(false)
  })
})

describe('status text', () => {
  it('describes each phase', () => {
    expect(searchStatus(['Indeed', 'LinkedIn'], 1, 2)).toBe('Searching Indeed, LinkedIn — 1 of 2 boards done')
    expect(scoringStatus(0, 0)).toBe('Scoring matches…')
    expect(scoringStatus(25, 60)).toBe('Scoring matches… 25 of 60')
  })
})

describe('outdatedCount', () => {
  it('counts outdated scores only', () => {
    expect(outdatedCount([posting('a', 70, true), posting('b', 70), posting('c')])).toBe(1)
    expect(outdatedCount(undefined)).toBe(0)
  })
})
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd frontend; npx vitest run src/lib/match.test.ts`
Expected: FAIL, `Failed to resolve import "./match"`.

- [ ] **Step 3: Implement**

Create `frontend/src/lib/match.ts`:

```ts
// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

import type { app, settings } from './backend'

// Job match scores on Discover. The backend computes the overall %; these
// helpers only present it.

export type MatchBand = 'good' | 'fair' | 'low'

export function matchBand(overall: number): MatchBand {
  if (overall >= 80) return 'good'
  if (overall >= 60) return 'fair'
  return 'low'
}

/** The factors in display order, with the weights the backend uses (internal/app/match.go). */
export const MATCH_FACTORS = [
  { key: 'resumeFit', label: 'Resume fit', weight: 50 },
  { key: 'seniority', label: 'Seniority', weight: 20 },
  { key: 'location', label: 'Work mode & location', weight: 15 },
  { key: 'salary', label: 'Salary', weight: 15 },
] as const

export type FactorRow = { label: string; weight: number; applicable: boolean; score: number; note: string }

export function factorRows(m: app.MatchScore): FactorRow[] {
  return MATCH_FACTORS.map((f) => {
    const x = m.factors[f.key]
    return { label: f.label, weight: f.weight, applicable: x.applicable, score: x.score, note: x.note }
  })
}

/** Scored postings by overall (highest first), then unscored ones in their original order. */
export function sortByMatch(postings: app.Posting[]): app.Posting[] {
  return postings
    .map((p, i) => ({ p, i }))
    .sort((a, b) => (b.p.match?.overall ?? -1) - (a.p.match?.overall ?? -1) || a.i - b.i)
    .map((x) => x.p)
}

/** A search starts scoring only when scoring is on and it actually brought in new postings. */
export function shouldAutoScore(s: settings.Settings | undefined, run: app.SearchRun): boolean {
  return !!s?.matchEnabled && !run.cached && run.newCount > 0
}

export function searchStatus(boards: string[], done: number, total: number): string {
  return `Searching ${boards.join(', ')} — ${done} of ${total} boards done`
}

export function scoringStatus(done: number, total: number): string {
  return total > 0 ? `Scoring matches… ${done} of ${total}` : 'Scoring matches…'
}

export function outdatedCount(postings: app.Posting[] | undefined): number {
  return postings?.filter((p) => p.match?.outdated).length ?? 0
}
```

In `frontend/src/lib/backend.ts`, change the runtime export line to:

```ts
export { BrowserOpenURL, EventsOn } from '../../wailsjs/runtime/runtime'
```

- [ ] **Step 4: Run to verify they pass**

Run: `cd frontend; npx vitest run src/lib/match.test.ts`
Expected: PASS (6 describe blocks).

- [ ] **Step 5: Verify and commit**

```bash
bash tools/verify.sh; echo "exit=$?"
git add frontend/src/lib/match.ts frontend/src/lib/match.test.ts frontend/src/lib/backend.ts
git commit -m "frontend: match-score helpers (bands, factor rows, sort, status text)"
```

---

### Task 7: Discover page: badges, breakdown dialog, status line, sorting

**Files:**
- Create: `frontend/src/pages/Discover/MatchBadge.tsx`
- Create: `frontend/src/pages/Discover/MatchDialog.tsx`
- Modify: `frontend/src/pages/Discover/PostingList.tsx`
- Modify: `frontend/src/pages/Discover/DiscoverPage.tsx`

**Interfaces:**
- Consumes: everything from `lib/match.ts` (Task 6); `ScoreInbox`, `RescoreOutdated`, `ScorePosting`, `GetSettings`, `ListAIProviders`, `EventsOn` from `lib/backend`; `Modal` (`components/Modal`); `formatDateTime` (`lib/format`).
- Produces:
  - `MatchBadge({ match, scoring, onOpen, onScore })`
  - `MatchDialog({ posting, providers, onClose, onRescore })`
  - `PostingList` gains props `scoring: boolean`, `onOpenMatch(p)`, `onScore(p)`.

- [ ] **Step 1: Create the badge**

`frontend/src/pages/Discover/MatchBadge.tsx`:

```tsx
// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

import type { KeyboardEvent, MouseEvent } from 'react'
import { RotateCw } from 'lucide-react'
import type { app } from '../../lib/backend'
import { matchBand, type MatchBand } from '../../lib/match'

const BAND_CLASS: Record<MatchBand, string> = {
  good: 'border-success/50 bg-success/15 text-emerald-300',
  fair: 'border-warn/50 bg-warn/15 text-amber-300',
  low: 'border-white/15 bg-white/5 text-ink-2',
}

type Props = {
  match?: app.MatchScore
  scoring: boolean // a run is going; unscored badges pulse
  onOpen: () => void
  onScore?: () => void // omitted where scoring isn't offered (Not interested tab)
}

// Lives inside the card's <button>, so it's a span with button behaviour and
// stops the click from also selecting the card.
function act(fn: () => void) {
  return {
    role: 'button',
    tabIndex: 0,
    onClick: (e: MouseEvent) => {
      e.stopPropagation()
      fn()
    },
    onKeyDown: (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        e.stopPropagation()
        fn()
      }
    },
  }
}

export function MatchBadge({ match, scoring, onOpen, onScore }: Props) {
  if (match) {
    return (
      <span
        {...act(onOpen)}
        title={match.outdated ? 'Graded against an older resume or preferences. Click for details.' : 'Match score. Click for the breakdown.'}
        className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 font-mono text-[11px] font-semibold ${BAND_CLASS[matchBand(match.overall)]} ${match.outdated ? 'opacity-50' : ''}`}
      >
        {match.outdated && <RotateCw size={10} />}
        {match.overall}%
      </span>
    )
  }
  if (scoring) {
    return <span className="inline-block h-5 w-10 shrink-0 animate-pulse rounded-full bg-white/10" aria-label="Scoring" />
  }
  return (
    <span className="flex shrink-0 items-center gap-1.5">
      <span className="rounded-full border border-white/10 px-2 py-0.5 font-mono text-[11px] text-ink-3">–</span>
      {onScore && (
        <span {...act(onScore)} className="text-[11px] text-ink-2 underline-offset-2 hover:text-ink hover:underline">
          Score this
        </span>
      )}
    </span>
  )
}
```

- [ ] **Step 2: Create the breakdown dialog**

`frontend/src/pages/Discover/MatchDialog.tsx`:

```tsx
// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

import { Modal } from '../../components/Modal'
import type { ai, app } from '../../lib/backend'
import { formatDateTime } from '../../lib/format'
import { factorRows, matchBand } from '../../lib/match'

const RING: Record<string, string> = { good: 'text-emerald-300', fair: 'text-amber-300', low: 'text-ink-2' }
const BAR: Record<string, string> = { good: 'bg-success', fair: 'bg-warn', low: 'bg-ink-3' }

type Props = {
  posting: app.Posting & { match: app.MatchScore }
  providers: ai.AIProvider[]
  onClose: () => void
  onRescore: () => void
}

export function MatchDialog({ posting, providers, onClose, onRescore }: Props) {
  const m = posting.match
  const provider = providers.find((p) => p.id === m.provider)?.label ?? m.provider
  return (
    <Modal title={`${posting.title}${posting.company ? ` · ${posting.company}` : ''}`} onClose={onClose}>
      <div className="flex items-center gap-4">
        <p className={`font-mono text-5xl font-bold ${RING[matchBand(m.overall)]}`}>{m.overall}%</p>
        <p className="text-sm text-ink-2">How well this job fits your resume and preferences, weighted by the factors below.</p>
      </div>

      {m.outdated && (
        <div className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-warn/30 bg-warn/5 px-3 py-2 text-xs text-amber-200">
          Graded against an older resume or preferences.
          <button className="btn btn-ghost py-1 text-xs" onClick={onRescore}>
            Re-score
          </button>
        </div>
      )}

      <ul className="mt-5 space-y-3">
        {factorRows(m).map((f) => (
          <li key={f.label} className={f.applicable ? '' : 'opacity-50'}>
            <div className="flex items-baseline justify-between gap-2 text-sm">
              <span className="font-semibold">
                {f.label} <span className="font-mono text-[11px] font-normal text-ink-3">{f.weight}%</span>
              </span>
              <span className="font-mono text-xs text-ink-2">{f.applicable ? f.score : 'not applicable'}</span>
            </div>
            {f.applicable && (
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/10">
                <div className={`h-full rounded-full ${BAR[matchBand(f.score)]}`} style={{ width: `${f.score}%` }} />
              </div>
            )}
            {f.note && <p className="mt-1 text-xs text-ink-3">{f.note}</p>}
          </li>
        ))}
      </ul>

      <div className="mt-5 grid grid-cols-2 gap-4 text-sm">
        <ReasonList title="Strengths" items={m.strengths} />
        <ReasonList title="Gaps" items={m.gaps} />
      </div>

      <p className="mt-5 font-mono text-[11px] text-ink-3">
        Scored by {m.model || 'an unknown model'} ({provider}), {formatDateTime(m.scoredAt)}
      </p>
    </Modal>
  )
}

function ReasonList({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <p className="label-mono mb-1">{title}</p>
      {items.length ? (
        <ul className="list-disc space-y-0.5 pl-4 text-ink-2">
          {items.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ul>
      ) : (
        <p className="text-ink-3">None noted</p>
      )}
    </div>
  )
}
```

(`formatDateTime`, `btn btn-ghost` and `label-mono` all exist already: `lib/format.ts` and the `@utility` rules in `index.css`.)

- [ ] **Step 3: Put the badge on each card**

In `frontend/src/pages/Discover/PostingList.tsx`, extend `Props`:

```tsx
type Props = {
  postings: app.Posting[]
  selectedId: string | null
  onSelect: (p: app.Posting) => void
  actions: PostingActions
  scoring: boolean
  onOpenMatch: (p: app.Posting) => void
  onScore: (p: app.Posting) => void
}
```

destructure them (`export function PostingList({ postings, selectedId, onSelect, actions, scoring, onOpenMatch, onScore }: Props)`), import `MatchBadge` from `./MatchBadge`, and render it as the first item in the right-hand group of the header row. Replace the three state chips with:

```tsx
                <div className="flex shrink-0 items-center gap-1.5">
                  <MatchBadge
                    match={p.match}
                    scoring={scoring}
                    onOpen={() => onOpenMatch(p)}
                    onScore={p.state === 'dismissed' ? undefined : () => onScore(p)}
                  />
                  {p.state === 'new' && <Chip tone="info">New</Chip>}
                  {p.state === 'saved' && <Chip tone="accent">{p.jobStatus ? labelFor(STATUS_LABEL, p.jobStatus) : 'Job deleted'}</Chip>}
                  {p.state === 'dismissed' && <Chip>{timeAgo(p.dismissedAt)}</Chip>}
                </div>
```

- [ ] **Step 4: Wire the page**

In `frontend/src/pages/Discover/DiscoverPage.tsx`:

1. Add to the `lib/backend` import: `EventsOn`, `GetSettings`, `ListAIProviders`, `RescoreOutdated`, `ScoreInbox`, `ScorePosting`. Add `LoaderCircle` to the lucide import. Add:

```tsx
import { outdatedCount, scoringStatus, searchStatus, shouldAutoScore, sortByMatch } from '../../lib/match'
import { MatchDialog } from './MatchDialog'
```

2. Below the other `useState` calls:

```tsx
  type Status = { phase: 'searching'; boards: string[]; done: number; total: number } | { phase: 'scoring'; done: number; total: number }
  const [status, setStatus] = useState<Status | null>(null)
  const [statusError, setStatusError] = useState('')
  const [sort, setSort] = useState(() => readPref(SORT_PREF, 'newest'))
  const [matchFor, setMatchFor] = useState<string | null>(null)
  const { data: appSettings } = useLoad(() => api(GetSettings()), [])
  const { data: providers } = useLoad(() => api(ListAIProviders()), [])

  useEffect(() => {
    const offSearch = EventsOn('search:progress', (p: { done: number; total: number }) =>
      setStatus((s) => (s?.phase === 'searching' ? { ...s, done: p.done, total: p.total } : s)),
    )
    const offMatch = EventsOn('match:progress', (p: { done: number; total: number }) => {
      setStatus({ phase: 'scoring', done: p.done, total: p.total })
      notifyDataChanged() // badges fill in request by request
    })
    return () => {
      offSearch()
      offMatch()
    }
  }, [])
```

and at module level, next to `QUERY_PREF`:

```tsx
const SORT_PREF = 'discoverSort'
```

3. Sorted list and selection use the sorted order. Replace the `selected` memo with:

```tsx
  const shown = useMemo(() => (sort === 'match' && postings ? sortByMatch(postings) : postings), [postings, sort])
  const selected = useMemo(() => shown?.find((p) => p.id === selectedId), [shown, selectedId])
  const matchPosting = shown?.find((p) => p.id === matchFor && p.match)
```

and in `advance`, use `shown` instead of `postings` (three occurrences inside that function).

4. A scoring helper, and searching with status (replace `search`):

```tsx
  const score = async (call: () => Promise<app.MatchRun>) => {
    setStatusError('')
    setStatus({ phase: 'scoring', done: 0, total: 0 })
    const r = await api(call())
    setStatus(null)
    notifyDataChanged()
    if (r?.error) setStatusError(r.error)
  }

  const search = async (call: SearchCall, q: app.SearchQuery = query) => {
    setSearching(true)
    setShowErrors(true)
    setStatusError('')
    const ready = q.sources.filter((id) => sources?.some((s) => s.id === id && !s.unavailable))
    setStatus({ phase: 'searching', boards: ready.map((id) => sourceLabel(sources ?? [], id)), done: 0, total: ready.length })
    const r = await api(call({ ...q, sources: ready }))
    setSearching(false)
    setStatus(null)
    if (!r) return
    writeSessionValue(LAST_RUN_KEY, r)
    setRun(r)
    setTab('inbox')
    notifyDataChanged()
    if (shouldAutoScore(appSettings, r)) await score(ScoreInbox)
  }
```

5. Status line: directly above the existing `{run && (<p ...>)}` block, add:

```tsx
      {status ? (
        <p className="flex items-center gap-2 font-mono text-[11px] text-ink-2">
          <LoaderCircle size={12} className="animate-spin" />
          {status.phase === 'searching' ? searchStatus(status.boards, status.done, status.total) : scoringStatus(status.done, status.total)}
        </p>
      ) : statusError ? (
        <p className="flex items-center gap-2 font-mono text-[11px] text-amber-300">
          <TriangleAlert size={12} />
          {statusError}
          <button onClick={() => setStatusError('')} aria-label="Dismiss" className="opacity-70 hover:opacity-100">
            <X size={12} />
          </button>
        </p>
      ) : outdatedCount(postings) > 0 ? (
        <button className="self-start font-mono text-[11px] text-ink-2 underline-offset-2 hover:text-ink hover:underline" onClick={() => score(RescoreOutdated)}>
          Re-score outdated ({outdatedCount(postings)})
        </button>
      ) : null}
```

6. Sort choice: in the filter bar, after the source `<select>`, add:

```tsx
        <select
          className="field w-auto py-1 text-xs"
          value={sort}
          onChange={(e) => {
            setSort(e.target.value)
            writePref(SORT_PREF, e.target.value)
          }}
          aria-label="Sort"
        >
          <option value="newest">Newest</option>
          <option value="match">Best match</option>
        </select>
```

7. List and dialog: render `shown` and pass the new props:

```tsx
          {!shown ? null : shown.length === 0 ? (
            <EmptyState tab={tab} filtered={!!(filter.query || filter.source || filter.onlyNew)} />
          ) : (
            <PostingList
              postings={shown}
              selectedId={selectedId}
              onSelect={select}
              actions={actions}
              scoring={status?.phase === 'scoring'}
              onOpenMatch={(p) => setMatchFor(p.id)}
              onScore={(p) => void score(() => ScorePosting(p.id))}
            />
          )}
```

and just before the page's closing `</div>`:

```tsx
      {matchPosting?.match && (
        <MatchDialog
          posting={{ ...matchPosting, match: matchPosting.match }}
          providers={providers ?? []}
          onClose={() => setMatchFor(null)}
          onRescore={() => void score(() => ScorePosting(matchPosting.id))}
        />
      )}
```

- [ ] **Step 5: Type-check, build, test**

Run: `cd frontend; npx tsc --noEmit; npx vitest run`
Expected: no tsc output; all vitest tests pass.

- [ ] **Step 6: Try it**

Run `wails dev`. With scoring off: the search status line shows boards finishing, and every card shows "–" plus "Score this". Click "Score this" with no resume set: the status line says "Add your resume on the Profile page to get match scores". (Real scoring is checked in Task 9.)

- [ ] **Step 7: Verify and commit**

```bash
bash tools/verify.sh; echo "exit=$?"
git add frontend/src/pages/Discover
git commit -m "discover: match badges, breakdown dialog, status line and Best match sort"
```

---

### Task 8: Settings: the Job matching section

**Files:**
- Create: `frontend/src/pages/Settings/JobMatchingSection.tsx`
- Modify: `frontend/src/pages/Settings/SettingsPage.tsx`

**Interfaces:**
- Consumes: `settings.Settings` match fields (Task 1), `ListAIProviders`, `Field`, `Section`.
- Produces: `JobMatchingSection({ s, setS })`.

- [ ] **Step 1: Create the section**

`frontend/src/pages/Settings/JobMatchingSection.tsx`:

```tsx
// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

import { Field } from '../../components/JobForm'
import { api } from '../../lib/api'
import { ListAIProviders, type settings } from '../../lib/backend'
import { useLoad } from '../../lib/useLoad'
import { Section } from './Section'

const WORK_MODES = [
  { id: 'remote', label: 'Remote' },
  { id: 'hybrid', label: 'Hybrid' },
  { id: 'onsite', label: 'On-site' },
]
const SENIORITY = ['entry', 'mid', 'senior', 'staff', 'principal', 'manager']

type Props = { s: settings.Settings; setS: (s: settings.Settings) => void }

/** Discover match scores: the switch, who grades, request size, and what "a good match" means to you. */
export function JobMatchingSection({ s, setS }: Props) {
  const { data: providers } = useLoad(() => api(ListAIProviders()), [])
  const toggleMode = (id: string) =>
    setS({ ...s, matchWorkModes: s.matchWorkModes.includes(id) ? s.matchWorkModes.filter((m) => m !== id) : [...s.matchWorkModes, id] })

  return (
    <Section
      title="Job matching"
      hint="Grades each Discover posting against your resume and these preferences. Postings go to the AI in groups, so a normal search costs one request."
    >
      <label className="mb-4 flex items-center gap-2 text-sm">
        <input type="checkbox" className="accent-indigo-500" checked={s.matchEnabled} onChange={(e) => setS({ ...s, matchEnabled: e.target.checked })} />
        Score new postings automatically after each search
      </label>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Provider">
          <select className="field" value={s.matchProvider} onChange={(e) => setS({ ...s, matchProvider: e.target.value })} aria-label="Job matching provider">
            {(providers ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
                {p.unavailable ? ' (setup needed)' : ''}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Postings per request (5–50)">
          <input
            className="field"
            type="number"
            min={5}
            max={50}
            value={s.matchPerRequest}
            onChange={(e) => setS({ ...s, matchPerRequest: Number(e.target.value) })}
          />
        </Field>
        <Field label="Salary floor (per year, $)">
          <input
            className="field"
            type="number"
            min={0}
            step={1000}
            value={s.matchMinSalary || ''}
            placeholder="No floor"
            onChange={(e) => setS({ ...s, matchMinSalary: Math.max(0, Math.round(Number(e.target.value) || 0)) })}
          />
        </Field>
        <Field label="Target seniority">
          <select className="field" value={s.matchSeniority} onChange={(e) => setS({ ...s, matchSeniority: e.target.value })}>
            <option value="">No target</option>
            {SENIORITY.map((v) => (
              <option key={v} value={v}>
                {v[0].toUpperCase() + v.slice(1)}
              </option>
            ))}
          </select>
        </Field>
        <div className="space-y-1.5">
          <span className="label-mono">Work modes</span>
          <div className="flex gap-3 text-sm">
            {WORK_MODES.map((m) => (
              <label key={m.id} className="flex items-center gap-1.5">
                <input type="checkbox" className="accent-indigo-500" checked={s.matchWorkModes.includes(m.id)} onChange={() => toggleMode(m.id)} />
                {m.label}
              </label>
            ))}
          </div>
        </div>
        <Field label="Locations">
          <input className="field" placeholder="e.g. Denver, CO; Boulder, CO" value={s.matchLocations} onChange={(e) => setS({ ...s, matchLocations: e.target.value })} />
        </Field>
        <Field label="Goals and deal-breakers" wide>
          <textarea
            className="field min-h-20"
            placeholder="e.g. Climate or health tech preferred. No on-call. No defense work."
            value={s.matchGoals}
            onChange={(e) => setS({ ...s, matchGoals: e.target.value })}
          />
        </Field>
      </div>
      <p className="mt-2 text-[11px] text-ink-3">
        Changing your resume or these preferences marks existing scores outdated; re-score them from Discover when you're ready. Nothing is re-graded on its own.
      </p>
    </Section>
  )
}
```

- [ ] **Step 2: Add it to the Settings page**

In `frontend/src/pages/Settings/SettingsPage.tsx`, import it:

```tsx
import { JobMatchingSection } from './JobMatchingSection'
```

and render it right after `<AIProvidersSection s={s} setS={setS} />`:

```tsx
      <JobMatchingSection s={s} setS={setS} />
```

In `save`, round the request size the way the other numbers are rounded:

```tsx
      SaveSettings({
        ...s,
        followUpDays: Math.round(Number(s.followUpDays)) || 7,
        discoverCacheHours: Math.round(Number(s.discoverCacheHours)) || 12,
        matchPerRequest: Math.round(Number(s.matchPerRequest)) || 25,
      }),
```

- [ ] **Step 3: Type-check and test**

Run: `cd frontend; npx tsc --noEmit; npx vitest run`
Expected: clean.

- [ ] **Step 4: Try it**

In `wails dev`, open Settings → Job matching. Save with 4 postings per request: a toast says "postings per request must be between 5 and 50". Save with valid values, reload Settings, and check they're kept.

- [ ] **Step 5: Verify and commit**

```bash
bash tools/verify.sh; echo "exit=$?"
git add frontend/src/pages/Settings
git commit -m "settings: Job matching section"
```

---

### Task 9: Docs, final checks and a live run

**Files:**
- Modify: `README.md` (Features list)
- Modify: `docs/superpowers/specs/2026-10-08-job-match-scores-design.md` (status line and live-run result)

- [ ] **Step 1: README**

In the Features section of `README.md`, add one bullet in the same style as its neighbours:

```markdown
- **Match scores on Discover:** an AI provider of your choice grades each posting against your resume and preferences (salary floor, work mode and location, seniority, goals). Postings go in groups, so a normal search costs one request; click a badge for the breakdown.
```

- [ ] **Step 2: Full check**

```bash
bash tools/verify.sh; echo "exit=$?"
go test -count=1 -v ./... 2>&1 | grep -E "^\s*--- (SKIP|FAIL)"
```

Expected: exit 0; the only SKIPs are `TestLiveDeepSeek`, `TestLiveLMStudio`, `TestLiveOllama`; no FAIL.

- [ ] **Step 3: Live run**

With a real provider set up (the user's choice; Gemini Live or Anthropic are the likely ones):
1. Settings → Job matching: switch on, pick the provider, set a few preferences. Make sure a resume is on the Profile page.
2. Discover: run a search that brings in new postings. Watch the status line go "Searching … boards done" → "Scoring matches… N of M" → cleared.
3. Open three badges; check the factors, notes, strengths and gaps make sense for those postings.
4. Change the resume text slightly; return to Discover. Badges show ↻ and "Re-score outdated (N)" appears.

Record in the spec, under a **Live run** line at the top: date, provider and model, number of postings, number of requests, total time, and any problems.

- [ ] **Step 4: Commit**

```bash
git add README.md docs/superpowers/specs/2026-10-08-job-match-scores-design.md
git commit -m "docs: match scores in the README; live-run notes in the spec"
```
