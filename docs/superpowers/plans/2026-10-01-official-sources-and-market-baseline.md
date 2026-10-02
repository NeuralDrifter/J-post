# Official Sources + Market Baseline — Implementation Plan

> Compact plan (user preference). REQUIRED SUB-SKILL: superpowers:executing-plans. Go tasks are TDD.

**Spec:** `docs/superpowers/specs/2026-10-01-official-sources-and-market-baseline-design.md`

## Review Focus

1. **The Jobicy limit is shared across different searches.** Expected: a second search within an hour skips Jobicy and explains when it can run next. Test: `TestJobicyCooldown`.
2. **A location The Muse doesn't use** (e.g. "Denver" without a state). Expected: a clear per-source message, not a silent zero. Test: `TestMuseEmptySlice`.
3. **USAJobs or Adzuna rejects the key.** Expected: the error names the status code and never includes the key or email. Test: `TestUSAJobsErrorsDoNotLeak`.
4. **HTML entities and nested lists in descriptions.** Expected: readable text with no leftover tags. Test: `TestHTMLToText`.
5. **No current job, and no default occupation.** Expected: no baseline, and the UI hint shows. Test: `TestMarketBaselineAbsent`.

### Task 1: Market baseline

**Files:** `compcalc.go`, `compcalc_test.go`; frontend `PackageCard`, `BreakdownTable`, `lib/sources.ts` (`baselineDetail`), with tests.

### Task 2: HTML to text + official API clients

**Files:**
- `htmltext.go` + test (uses `golang.org/x/net/html`).
- `official_sources.go` + test: `usajobsSearch`, `himalayasSearch`, `jobicySearch`.
- Base URLs are vars so tests can point them at fake servers.

### Task 3: The Muse local slices + cooldowns

**Files:**
- Migration 5 in `db.go`.
- `muse.go` + test: `syncMuseSlice`, `searchMuse`, `museSlices(q, settings)`.
- `source_calls` helpers: `lastSourceCall`, `recordSourceCall`.

### Task 4: Wiring

- **`knownSources`** gains the four new sources.
- **The `RunSearch` fetch closure** in `app.go` dispatches to every source and applies the Jobicy cooldown.
- **Settings fields:** `usajobsKey`, `usajobsEmail`, `museCategories`, with validation; the email is required when a key is set.
- **Regenerate the bindings.**

### Task 5: Frontend

- **`SearchForm`:** two grouped rows, the new sources, disabled-with-reason states.
- **`SOURCE_LABEL`:** the new sources added.
- **Settings:** a USAJobs section (key, email, link) and a The Muse categories checklist.
- **README:** a sources table with their rules.

### Task 6: Verify

Run `go vet`, `go test`, `npm test`, `npm run build` and `wails build`. Hand off to the user.
