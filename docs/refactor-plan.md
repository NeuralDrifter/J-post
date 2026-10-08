# Refactor Plan: backend packages
Status: phase 4 (extract) | Started: 2026-10-08 | Branch: `refactor/backend-packages`

Goal: move the ~95 Go files out of the repo root into focused packages under
`internal/`, without changing what the app does. Structure only: no bug fixes,
renames or restyling during a move (only the capitalization needed to cross a
package boundary, plus imports).

## Responsibility Map (survey, 2026-10-08)
One `package main`: ~8,600 lines of code, ~6,100 lines of tests. Found with a
go/types file-to-file reference map.

- OS processes: `proc_windows.go`, `proc_other.go` (leaf)
- String helpers: `text.go`, `htmltext.go` (text.go reads `dateLayout` from db.go)
- HTTP: `httpclient.go` (uses `httpErrorMessage` from official_sources.go)
- Market data: `marketdata.go` + `marketdata/marketdata.json.gz` (leaf)
- Taxes: `taxes.go` + `taxdata/us_2026.json` (uses marketdata `SourceInfo`)
- Settings: `settings.go` (validates provider IDs from aitask.go and answer
  modes from provider_openai.go, which both read Settings: a cycle)
- Gemini: `gemini.go`, `live.go`, `voices.go`
- AI tasks and providers: `aitask*.go`, `aianswer.go`, `provider_*.go`
  (provider_claudecode uses `lastLine` from discover.go)
- Offer evaluation: `compcalc.go` (pure) over the `CompPackage` type in comp.go
- Job-site fetchers: `discover.go`, `muse.go`, `official_sources.go`,
  `sources.go`, `scripts/scraper.py` (mixed with merge/dedupe and Repo methods)
- Database `Repo`: methods spread over db, jobs, contacts, attachments,
  profile, metrics, legacy_import, comp, postings, searches, sources,
  interviews, interviews_ai, plans, scorecards
- Wails bindings: `app.go`, `window.go`, `main.go`

Shared state: `*Repo` (SQLite handle, files dir, clock) and `*App` (repo,
settings store, window state, live sessions). `db.go` depends on plans.go
`keptPlans`.

## Safety Net
- One command: `bash tools/verify.sh` = gofmt check, `go vet ./...`,
  `go test ./...`, `wails generate module`, frontend `npm run build` (tsc) and
  `vitest run`.
- Baseline 2026-10-08 on 711c67d: all green (Go tests pass, 79 frontend tests
  pass, binding regeneration produces no diff).
- `frontend/wailsjs` is tracked, so binding changes land in the move's commit
  and `tsc` checks every TypeScript use of a moved type.
- Final check: `wails build`, then launch the app and click through each page.

## Target Structure
```
main.go, generate.go, copyright_test.go   entry point, go:generate, header check
internal/
  osproc/      start/stop external processes, open files in the OS
  textproc/    string cleanup: truncate, normalize, HTML to plain text
  httpapi/     shared HTTP client with timeouts and readable errors
  marketdata/  BLS/BEA wage and cost-of-living lookups (+ embedded data)
  taxes/       2026 federal and state income tax calculation (+ embedded data)
  settings/    load, validate and save user settings and window state
  gemini/      Gemini REST calls, Live sessions and voice samples
    geminitest/  fake Gemini servers for other packages' tests
  ai/          AI task runner and its providers
  comp/        the offer package type and its pure evaluation
  discover/    job-site fetchers (JobSpy, Adzuna, Muse, USAJobs, Himalayas, Jobicy)
  app/         Wails bindings, the SQLite Repo and the interview flow
  licensegen/  (unchanged)
```
Dependency rule: each package imports only packages listed above it, and
nothing imports `app`. No `utils`/`common`/`helpers` packages. Each `_test.go`
moves in the same commit as the code it tests.

## Move Checklist
Each line is one commit, green before the next.
- [x] plan: add this file and `tools/verify.sh`
- [x] extract-leaf-module: process helpers -> internal/osproc
- [x] prep: `dateLayout` and `lastLine` move into text.go; `clamp` moves to window.go
- [x] extract-leaf-module: string and HTML helpers -> internal/textproc
- [x] prep: `httpErrorMessage` and its test move next to the HTTP client
- [x] extract-leaf-module: HTTP client -> internal/httpapi (fakeServer test helper copied: 4 lines)
- [x] extract-leaf-module: market data -> internal/marketdata (+ data file, build script path)
- [x] extract-leaf-module: taxes -> internal/taxes (+ data file, build script path)
- [x] prep: provider IDs and answer modes move to settings.go (break settings <-> ai); Save checks a fixed ID list, guarded by TestProviderIDsMatchRegistry
- [x] extract-data-types: settings and window state store -> internal/settings
- [x] prep: voice sampling (voice_sample.go) splits from the voice catalog; interview-typed Live tests move to interviews_ai_test.go
- [x] extract-leaf-module: Gemini REST, Live sessions, voice sampling -> internal/gemini (+ geminitest helpers)
- [ ] extract-leaf-module: AI task runner and providers -> internal/ai (+ testdata/fakeclaude)
- [ ] prep: split the CompPackage type from its Repo persistence in comp.go
- [ ] extract-pure-core: CompPackage + Evaluate -> internal/comp
- [ ] prep: split fetchers from merge/Repo code in discover.go and sources.go
- [ ] extract-leaf-module: job-site fetchers -> internal/discover (+ scraper.py)
- [ ] prep: `keptPlans` dependency of db.go (if still needed once in app)
- [ ] extract: Repo, bindings and interview flow -> internal/app
- [ ] thin-entry-point: wails.Run moves into app.Run; main.go only wires
- [ ] final: frontend `main.X` -> new namespaces, README paths, wails build + launch

## Decisions & Discoveries
- 2026-10-08: tests stay beside the code they test (Go requires it).
- 2026-10-08: the Repo methods keep ~15 files together in `app`; splitting
  Repo is a separate campaign (see Deferred).

- 2026-10-08: the string package is `textproc`, not `text`: several files have
  locals named `text` that would shadow it. `clamp` is numeric, so it stayed
  in the root (window.go) instead of joining the string helpers.
- 2026-10-08: embedded data files sit beside their package's .go file
  (internal/marketdata/marketdata.json.gz), not in a data/ subfolder.
- 2026-10-08: frontend types now come from several Wails namespaces
  (`main`, `marketdata`, ...); lib/backend.ts re-exports each one.
- 2026-10-08: compcalc_test.go has its own copy of the `testMarket` fixture
  (it builds a MarketData from exported fields), so tests in two packages can use it.
- 2026-10-08: the voice catalog and interviewer names are interview logic and
  stay with app; only the Live voice-sample recorder moves to gemini.
- 2026-10-08: tests outside gemini redirect it to fake servers through
  `gemini.SetTestEndpoints` and the `gemini/geminitest` helpers (the
  net/http/httptest pattern). gemini's own tests keep their small unexported
  copies of those helpers, since gemini cannot import geminitest.

## Deferred: hand off to the next campaign
- [ ] Split `Repo` into a `store` package plus feature packages (jobs,
  interviews, postings, comp) — Repo methods span ~15 files — refactor-legacy
- [ ] `textproc.InnerSpaceRun` is an exported regexp only because profile.go
  uses it; give profile a function instead — clean-code
- [ ] `taxes.RoundDollars` is exported only because compcalc uses it; it is
  general rounding, not tax logic — clean-code
- [ ] Stuttering names left by verbatim moves: `settings.SettingsStore`,
  `marketdata.MarketData`, `settings.NewSettingsStore` — rename after the
  campaign (touches the frontend models too) — clean-code
