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
  text/        string cleanup: truncate, normalize, HTML to plain text
  httpapi/     shared HTTP client with timeouts and readable errors
  marketdata/  BLS/BEA wage and cost-of-living lookups (+ embedded data)
  taxes/       2026 federal and state income tax calculation (+ embedded data)
  settings/    load, validate and save user settings and window state
  gemini/      Gemini API calls, Live audio sessions and interviewer voices
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
- [ ] extract-leaf-module: process helpers -> internal/osproc
- [ ] prep: `datePart` stops depending on db.go's `dateLayout`
- [ ] extract-leaf-module: string and HTML helpers -> internal/text
- [ ] prep: `httpErrorMessage` moves next to the HTTP client; `lastLine` to text
- [ ] extract-leaf-module: HTTP client -> internal/httpapi
- [ ] extract-leaf-module: market data -> internal/marketdata (+ data file, build script path)
- [ ] extract-leaf-module: taxes -> internal/taxes (+ data file, build script path)
- [ ] prep: provider IDs and answer modes move to settings.go (break settings <-> ai)
- [ ] extract-data-types: settings and window state store -> internal/settings
- [ ] extract-leaf-module: Gemini API, Live, voices -> internal/gemini
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

## Deferred: hand off to the next campaign
- [ ] Split `Repo` into a `store` package plus feature packages (jobs,
  interviews, postings, comp) — Repo methods span ~15 files — refactor-legacy
