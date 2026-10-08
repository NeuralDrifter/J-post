# Licenses Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** An Open-source licenses page, reached from Settings → About, listing generated library licenses plus data sources, services and thanks.

**Architecture:** `internal/licensegen` collects Go modules (`go list -deps -json`) and npm production packages (walking `node_modules`) with their license texts. `tools/licenses` writes `frontend/src/generated/licenses.json`, which the React page imports. A Go test fails when the JSON is stale.

**Tech Stack:** Go 1.26, React + TypeScript (vitest), react-router (HashRouter).

**Spec:** `docs/superpowers/specs/2026-10-08-licenses-page-design.md`

**Plan style (user preference):** files, interfaces and tests; no full code.

## Global Constraints

- Output path is exactly `frontend/src/generated/licenses.json`. Entry fields are `name, version, license, url, text`, sorted by name.
- npm: `dependencies` only (plus `tailwindcss`, `vite` as shipped build output); never other devDependencies.
- A Go module without a license file fails generation.
- The Tax Foundation entry states CC BY-NC 4.0, the attribution link, and the non-commercial note.
- Each task ends with `go vet ./...`, `go test ./...`, and for frontend changes `npx tsc --noEmit -p .` + `npx vitest run`.
- Commits end with `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.

## Review Focus

1. **A package whose license file is `LICENSE.md` / `license` (lowercase) / `LICENCE`:** still found. → Task 1 `TestFindLicenseFileVariants`.
2. **Two versions of one npm package** (nested `node_modules`): both listed with their own versions. → Task 1 `TestNpmNestedVersions`.
3. **Stale JSON after `go get`:** the test names the module and says to run `go generate ./...`. → Task 2 `TestLicensesUpToDate`.
4. **Very long license texts** (Apache-2.0 + NOTICE for dozens of modules): the page stays responsive, because texts render only when a row is expanded. → Task 3, expand-on-demand.
5. **Search with no matches:** shows "No matches", not an empty page. → Task 3 `filterLicenses` test.

---

### Task 1: `internal/licensegen` collection

**Files:** create `internal/licensegen/licensegen.go` and `licensegen_test.go`, plus fixtures under `internal/licensegen/testdata/`.

**Interfaces:**
- `type Entry struct { Name, Version, License, URL, Text string }` (json tags lowercase).
- `func DetectLicense(text string) string`
- `func FindLicenseText(dir string) (text string, ok bool)` (license file + NOTICE)
- `func CollectGo(moduleRoot string) ([]Entry, error)`: `go list -deps -json .`, modules only, excluding std and the main module. URL is `https://pkg.go.dev/<path>`.
- `func CollectNpm(frontendDir string, extra ...string) ([]Entry, error)`: Node-style resolution from each package's dir upward. URL is the `homepage` or `repository` field, normalised to https.

**Tests:** `TestDetectLicense` (MIT, Apache-2.0, BSD-3, BSD-2, ISC, MPL-2.0, Other), `TestFindLicenseFileVariants`, `TestFindLicenseAppendsNotice`, `TestNpmProductionOnly` (devDependency excluded, `extra` included), `TestNpmNestedVersions`, `TestNpmScopedPackage`, `TestNpmMissingLicenseFile`, `TestCollectGoExcludesStdAndMain` (runs on this repo).

### Task 2: Generator and staleness test

**Files:** create `tools/licenses/main.go` and `generate.go` (root: `//go:generate go run ./tools/licenses`). Generated: `frontend/src/generated/licenses.json`. Add `TestLicensesUpToDate` in `internal/licensegen`.

**Interfaces:** `licensegen.Write(path string, go_, npm []Entry) error` (sorted, indented JSON). `type File struct { Go, Npm []Entry }`.

**Tests:** `TestLicensesUpToDate` (Go always; npm when `frontend/node_modules` exists), naming added/removed entries.

### Task 3: Licenses page and About section

**Files:** create `frontend/src/pages/Licenses/LicensesPage.tsx`, `credits.ts`, `filter.ts`, `filter.test.ts`. Modify `frontend/src/App.tsx` (route `licenses`) and `frontend/src/pages/Settings/SettingsPage.tsx` (About section with button).

**Interfaces:** `filterLicenses(entries: LicenseEntry[], query: string): LicenseEntry[]` (case-insensitive on name and license ID). `credits.ts` exports `DATA`, `SERVICES`, `THANKS: { name, detail, license?, url }[]`.

**Page:** a header with a back link to Settings. Sections Libraries (Go / Frontend tabs with counts, search, rows expand to show the text in a scrollable `<pre>`), Data, Services, Thanks. External links open with `BrowserOpenURL`.

**Tests:** `filterLicenses` (by name, by license, case-insensitive, no matches → []).

### Task 4: Docs

README: a "Licenses" note on how to regenerate (`go generate ./...`) and the Tax Foundation non-commercial caveat. Spec status → Implemented.
