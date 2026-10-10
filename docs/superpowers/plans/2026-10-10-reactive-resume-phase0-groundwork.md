# Reactive Resume — Phase 0: Groundwork Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Apply the `clean-code` skill to every file we author.

**Goal:** Job Track runs on React 19.3, contains Reactive Resume's engine packages as vendored source that type-checks and passes its own unit tests, and credits Reactive Resume as included code everywhere a licence notice belongs.

**Architecture:** Upstream `packages/{schema,resume,pdf,docx,import,fonts,utils}/src` are copied by a repeatable script into `frontend/src/vendor/reactive-resume/<pkg>/`, with server-only files dropped and an attribution header prepended. Their `@reactive-resume/<pkg>/...` imports resolve through Vite aliases and tsconfig `paths`, so upstream code is not rewritten. `internal/licensegen` gains a `vendored` group so the licences page and its staleness test cover it.

**Tech Stack:** React 19.3, TypeScript 5.9, Vite 6, Vitest, Go 1.23, Wails v2.

**Spec:** `docs/superpowers/specs/2026-10-10-reactive-resume-integration-design.md`

## Global Constraints

- Upstream: `https://github.com/reactive-resume/reactive-resume` commit `b3d8266c5e8f6d8ed8401baa64ceefd912281e7e`, MIT, `Copyright (c) 2026 Amruth Pillai`.
- Vendored root: `frontend/src/vendor/reactive-resume/` with `LICENSE` (verbatim) and `UPSTREAM.md`.
- Vendored file header (exact):
  ```
  // Derived from Reactive Resume (https://github.com/reactive-resume/reactive-resume), commit b3d8266.
  // Copyright (c) 2026 Amruth Pillai. SPDX-License-Identifier: MIT
  ```
  plus `// Modified by Michael P. Burgus, 2026.` on files with local changes.
- Packages NOT vendored: `ai`, `api`, `auth`, `db`, `email`, `env`, `mcp`, `dsh-plugin`, `ui`, `config`, apps.
- Files dropped from vendored packages: `pdf/src/server.tsx`, `pdf/src/forme/images.node.ts` (+ its tests), `utils/src/monorepo.node.ts`, `utils/src/url-security.node.ts`, `utils/src/rate-limit.ts`, and every test that needs Node networking, Postgres, `@napi-rs/canvas`, or rasterising.
- React `^19.3.0`, `react-dom` `^19.3.0`. Dependency versions match upstream's at `b3d8266` where upstream has them.
- Our own code: clean-code rules; existing Job Track header (`Copyright (c) 2026 Michael P. Burgus …` + `SPDX-License-Identifier: MIT`).

## Review Focus

- Re-syncing upstream later: running the vendor script twice gives identical output (no doubled headers) — Task 2 test.
- A vendored file losing its attribution header (hand edit, new file) — `copyright_test.go` checks the vendored tree separately (Task 3).
- The licences page with the new `vendored` group but an older generated JSON missing it — page must not crash; generator always writes the key (Task 3).
- React 19 removes `element.ref` access and changes `useRef()` typing — `tsc` must be clean and every page must render (Task 1 manual pass).
- Vendored tests leaking DOM or env between runs — vendored tests run in their own vitest project with upstream's setup semantics (Task 2).

---

### Task 1: Upgrade React 18 → 19.3

**Files:**
- Modify: `frontend/package.json`, `frontend/package-lock.json`
- Modify: any `frontend/src/**/*.tsx` that fails `tsc` after the upgrade

- [ ] **Step 1:** `cd frontend; npm install react@^19.3.0 react-dom@^19.3.0 react-markdown@^10.1.0; npm install -D @types/react@^19.3.0 @types/react-dom@^19.3.0`
- [ ] **Step 2:** `npm run build` — fix each type error at its source (typical: `useRef<T>()` needs an argument, `JSX` namespace now `React.JSX`, `ReactElement` props typed `unknown`). No `any`, no `@ts-expect-error`.
- [ ] **Step 3:** `npx vitest run` — all existing tests pass.
- [ ] **Step 4:** `wails dev`, visit Pipeline, Job detail, Discover, Offers, Interviews, Settings, Licences; no console errors.
- [ ] **Step 5:** `go generate ./...` (licence list changes with the new versions), `bash tools/verify.sh` green, commit `deps: React 19.3 (needed by Reactive Resume's PDF renderer)`.

### Task 2: Vendor the engine packages

**Files:**
- Create: `tools/vendor_reactive_resume.sh` — copies upstream, drops excluded files, prepends header idempotently
- Create: `frontend/src/vendor/reactive-resume/{LICENSE,UPSTREAM.md}` and the copied trees
- Modify: `frontend/vite.config.ts` (aliases, vendored test project), `frontend/tsconfig.json` (`paths`, `allowImportingTsExtensions`), `frontend/package.json` (runtime + test deps)

**Interfaces — Produces:** import specifiers `@reactive-resume/{schema,resume,pdf,docx,import,fonts,utils}/<export>` usable from `frontend/src`, matching upstream `package.json` `exports` maps (e.g. `@reactive-resume/schema/resume/data`, `@reactive-resume/pdf/browser`, `@reactive-resume/docx`), and `#react-pdf-renderer` → `pdf/forme/primitives.tsx`.

- [ ] **Step 1:** Write `tools/vendor_reactive_resume.sh <upstream-checkout>`:
  ```bash
  #!/usr/bin/env bash
  # Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
  # SPDX-License-Identifier: MIT
  #
  # Copies Reactive Resume's engine packages into frontend/src/vendor/reactive-resume.
  # Local modifications listed in UPSTREAM.md must be re-applied after a re-sync.
  # Usage: bash tools/vendor_reactive_resume.sh reference/3rd_party/reactive-resume
  set -euo pipefail
  upstream=$(cd "$1" && pwd)
  cd "$(dirname "$0")/.."
  dest=frontend/src/vendor/reactive-resume
  packages=(schema resume pdf docx import fonts utils)
  commit=$(git -C "$upstream" rev-parse --short=7 HEAD)
  header="// Derived from Reactive Resume (https://github.com/reactive-resume/reactive-resume), commit $commit.
  // Copyright (c) 2026 Amruth Pillai. SPDX-License-Identifier: MIT"

  for pkg in "${packages[@]}"; do
      rm -rf "${dest:?}/$pkg"
      cp -R "$upstream/packages/$pkg/src" "$dest/$pkg"
  done
  cp "$upstream/LICENSE" "$dest/LICENSE"
  while read -r excluded; do rm -rf "${dest:?}/$excluded"; done < tools/vendor_reactive_resume.exclude
  find "$dest" -type f \( -name '*.ts' -o -name '*.tsx' -o -name '*.mts' \) | while read -r f; do
      grep -q 'Derived from Reactive Resume' "$f" || { printf '%s\n' "$header" | cat - "$f" > "$f.tmp" && mv "$f.tmp" "$f"; }
  done
  ```
  and `tools/vendor_reactive_resume.exclude` listing the excluded paths (one per line, relative to `$dest`).
- [ ] **Step 2:** Run it; run it again; `git status --porcelain frontend/src/vendor | wc -l` unchanged between runs and no file has two header lines (`grep -c 'Derived from' f` = 1 for every file).
- [ ] **Step 3:** Add aliases mirroring each upstream `exports` map (wildcards → regex aliases) in `vite.config.ts`, and the same in `tsconfig.json` `paths`. Install the upstream runtime deps at upstream's versions: `@formepdf/core@0.27.0 @formepdf/react@0.27.0 react-reconciler@0.34.0 zod docx node-html-parser fflate fast-png cjk-regex css-tree @bramus/specificity fast-json-patch wink-porter2-stemmer pdfjs-dist@6.4.299 @sindresorhus/slugify uuid unique-names-generator`; dev: `happy-dom @testing-library/react @testing-library/jest-dom fast-check @types/css-tree`.
- [ ] **Step 4:** `npm run build` — fix vendored type errors with the smallest local change; record each in `UPSTREAM.md` and add the "Modified by" header line to that file.
- [ ] **Step 5:** Vitest: a second project `vendor` (include `src/vendor/**/*.test.{ts,tsx}`, environment from upstream: happy-dom for `.tsx`, node for `.ts`) with a setup file equivalent to upstream `vitest.setup.ts` minus server env. Run; move any test that needs excluded infrastructure into the exclude list with its reason in `UPSTREAM.md`.
- [ ] **Step 6:** Write `UPSTREAM.md`: upstream URL and full commit, packages taken, excluded files with reasons, local modifications, re-sync procedure.
- [ ] **Step 7:** `bash tools/verify.sh` green; commit `vendor: Reactive Resume engine packages at b3d8266 (MIT, © Amruth Pillai)` — in the same commit as Task 3's licence changes if Task 3 is done first; otherwise Task 3 lands before this branch merges.

### Task 3: Licence and attribution

**Files:**
- Modify: `LICENSE`, `README.md`, `copyright_test.go`
- Modify: `internal/licensegen/file.go`, `internal/licensegen/licensegen.go` (new `CollectVendored`), `internal/licensegen/licensegen_test.go`, `internal/licensegen/uptodate_test.go`, `tools/licenses/main.go`
- Modify: `frontend/src/pages/Licenses/{LicensesPage.tsx,credits.ts}`, `frontend/src/generated/licenses.json` (regenerated)
- Modify: `docs/superpowers/specs/2026-10-08-licenses-page-design.md` (one-line note)

**Interfaces — Produces:** `licensegen.CollectVendored(vendorRoot string) ([]Entry, error)` — one `Entry` per direct sub-folder holding `LICENSE` and `UPSTREAM.md`; `Name`, `URL`, `Version` (short commit) parsed from `UPSTREAM.md` lines `Name: …`, `Upstream: …`, `Commit: …`. `File.Vendored []Entry \`json:"vendored"\``. `Write(path, app, goEntries, npmEntries, vendored)` takes them as a `File` value instead of a growing parameter list.

- [ ] **Step 1 (test):** `TestCollectVendored` builds a temp `vendor/demo/{LICENSE,UPSTREAM.md}` and asserts `Entry{Name:"Demo", Version:"abc1234", License:"MIT", URL:"https://example.com/demo", Text: <licence>}`; a folder missing `UPSTREAM.md` is an error naming the folder. `TestLicensesUpToDate` also compares `Vendored`.
- [ ] **Step 2:** Run `go test ./internal/licensegen/` — fails (undefined).
- [ ] **Step 3:** Implement `CollectVendored`; change `Write` to `Write(path string, f File) error`; update `tools/licenses/main.go` and the round-trip test.
- [ ] **Step 4:** `copyright_test.go`: under `frontend/src/vendor/<name>/`, require the `Derived from` line and `SPDX-License-Identifier: MIT` instead of Job Track's line; everything else unchanged. Test name and failure message say which rule failed.
- [ ] **Step 5:** `go generate ./...`; `go test ./...` green.
- [ ] **Step 6:** Licences page: Libraries gets a third tab, "Included source" (vendored), shown first; remove Reactive Resume from `THANKS`.
- [ ] **Step 7:** `LICENSE` paragraph, README "Resumes" bullet + `vendor/` in project layout, licences-spec note (wording from the spec's **Licence and attribution** section).
- [ ] **Step 8:** `bash tools/verify.sh` green; commit.
