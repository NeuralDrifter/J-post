# Licenses page — Design Spec

**Date:** 2026-10-08 · **Status:** Implemented (branch feature/licenses-page)

**Deviations found while building:**
- Shipped build tools (`tailwindcss`, `vite`) are listed as themselves only, not their dependency trees. Those are build-time only and differ per platform (e.g. `@esbuild/win32-x64`), which would make the staleness check fail on another OS.
- ISC detection also matches the older wording "permission to use, copy, modify, and distribute" (`coder/websocket`).
- The page is lazy-loaded, so its ~440 KB of license text is its own chunk and stays out of app startup.
- Job Track's own MIT license (repo-root `LICENSE`, © 2026 Michael P. Burgus) is generated into the JSON as `app` and shown first on the page.
- Result: 40 Go modules and 100 npm packages, all with license text. Checked in the running app: search, expand, and the Data panel.

## Goal

Job Track lists everything it is built on or draws from, with each license's full text where one applies. The list is **generated**, not typed by hand, and a test fails when it goes stale. It meets the notice requirements of the bundled libraries (MIT, Apache-2.0, BSD, OFL fonts) and gives data sources and inspirations their credit.

## Where

- Settings gets a last section, **About**, with an **Open-source licenses** button.
- The button opens a new route, `/licenses`, a full page with a back link to Settings.

## What the page lists

1. **Libraries**, generated:
   - **Go:** every module compiled into the app (`go list -deps` of the main package, excluding the standard library and Job Track itself).
   - **Frontend:** every package reachable from `frontend/package.json` `dependencies` (not dev), resolved in `node_modules` the way Node does. This includes the `@fontsource` fonts (OFL-1.1).
   - Plus build tools whose output is shipped in the app: `tailwindcss` (its base CSS) and `vite` (small runtime helpers).
   - Each row shows name, version, license ID, link, and the full license text, expandable. A search box filters by name.
2. **Data:** fixed entries.
   - BLS OEWS May 2025 (US government, public domain).
   - BEA Regional Price Parities 2024 (public domain).
   - IRS Rev. Proc. 2025-32 and SSA 2026 figures (public domain).
   - **Tax Foundation**, "State Individual Income Tax Rates and Brackets, 2026": credited with a link. (Its site licenses its publications CC BY-NC 4.0; the app uses only the tax rates, which are facts set by state law.)
3. **Services the app connects to:** fixed entries, each with a link.
   - Job sources: Adzuna, USAJobs, Himalayas, Jobicy, The Muse.
   - JobSpy (MIT; runs from your own Python, not bundled).
   - AI providers: Gemini, Anthropic, Claude Code, OpenAI, DeepSeek, Ollama, LM Studio.
4. **Thanks:** fixed entries.
   - Reactive Resume (MIT): the tolerant JSON parsing approach and provider list informed the AI providers. If its ATS scanner code is ported later, it moves to Libraries with its full license.
   - ATS Screener (MIT): its research notes on applicant tracking systems.

## Generation

- `go generate ./...` runs `go run ./tools/licenses`, which writes `frontend/src/generated/licenses.json`: `{ go: [...], npm: [...] }`, each entry `{name, version, license, url, text}`.
- The collection logic lives in `internal/licensegen` (Go). License ID comes from `package.json` `license` for npm. For Go it's detected from the license file's text (MIT, Apache-2.0, BSD-2/3-Clause, ISC, MPL-2.0, Unlicense, else "Other").
- The license file is the first of `LICENSE*`, `LICENCE*`, `COPYING*`, `NOTICE` is appended when present (Apache-2.0 asks for it). A Go module with no license file fails generation, so a gap is never silent. An npm package without one is listed with an empty text and its declared ID.
- Data, services and thanks are a hand-written `frontend/src/pages/Licenses/credits.ts`.

## Staleness test

`internal/licensegen` test: collect again and compare the set of `name@version` against the committed JSON, for Go always and for npm when `frontend/node_modules` exists. A mismatch names the added/removed entries and says to run `go generate ./...`.

## Testing

- License ID detection on sample texts.
- npm resolution on a fixture `node_modules` tree: nested version conflict, scoped package, missing license file, dev dependency excluded.
- Go collection excludes the standard library and the main module.
- Frontend: the search filter, as a pure function, in vitest.
