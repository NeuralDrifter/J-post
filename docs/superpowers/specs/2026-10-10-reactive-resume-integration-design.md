# Reactive Resume integration — Design Spec

**Date:** 2026-10-10 · **Status:** Phases 0–5 implemented (branch feature/reactive-resume); the LLM phase is future work

**Deviations found while building (phases 0–1):**
- Reactive Resume has 17 templates (the 18th folder is shared code).
- The font allowlist is every URL in the font catalogue, which includes jsDelivr (Computer Modern) as well as fonts.gstatic.com. Requests go to `/rr-fonts?src=<url>` through a Wails asset middleware.
- PDFs render in a Web Worker (as upstream does); about a second per render on the main thread froze the page.
- Exports are strict (a missing font fails the export); the preview falls back to standard fonts and shows a chip.
- Two UI-free files from upstream's web app are vendored rather than rewritten: the editor's section/entry model and the design presets.
- The default resume picker lives in Settings → Profile & resume (above the uploaded resume, now labelled the fallback), not a new menu item.
- Layout is edited with move buttons (other column, up, down, page) instead of drag between columns; entries still reorder by drag.
- Icon fields take a Phosphor icon name as text; no icon picker yet.

**Deviations found while building (phases 2–5):**
- Letters, resumes and the shared editor frame: the editor store is generic, the design sections edit metadata through a context, and the letter writer reuses the builder's preview, top bar and design panels.
- Word files are imported by reading their text locally (upstream sends them to an AI provider); the AI phase may add a better reader.
- Reactive Resume's next-step hints are not ported: Job Track already shows days in stage, stale jobs, follow-up flags and a Next up banner.
- Match scores remember the resume they were graded against; "outdated" compares against that resume, and re-scoring keeps each posting on its resume.
- The interview calendar export is Job Track's own (several events per file); upstream's builds one event per file.
- The ATS findings' wording is upstream's messages.ts, vendored unchanged with an English-only shim for its Lingui `t` macro.
- The ATS analysis runs on the main thread (about 0.4 s); the PDF render it checks runs in the worker.

## Goal

Job Track gains a full resume and cover-letter workshop built on [Reactive Resume](https://github.com/reactive-resume/reactive-resume) (MIT, © 2026 Amruth Pillai), upstream commit `b3d8266c5e8f6d8ed8401baa64ceefd912281e7e` (2026-10-06):

- keep any number of resumes and cover letters, edit them in a full builder, render them with all of RR's templates, export PDF, DOCX and JSON;
- import resumes from JSON Resume, RR v4/v5 JSON, a LinkedIn export, and PDF/DOCX;
- tie documents to the job search: a default resume for AI features, per-job linked and tailored copies, "Score with" any resume in Discover, and RR's ATS checker on the job detail page.

It must look like it was always part of Job Track: every screen is built from Job Track's own components and Obsidian Lumina tokens. The resume templates keep their own design, because they are the printed document, not app chrome.

The open-source credit changes from "thanks" to a real attribution of derived code (see **License and attribution**).

## Scope

**In:** document library (resumes, cover letters, trash), builder (content, design, layout, typography, colours, page, custom CSS, notes), all RR templates, PDF/DOCX/JSON export, importers, ATS checker, per-job tailored copies, and the parts of RR's application tracker that Job Track lacks (CSV export, ICS export of interviews, next-step hints), merged into the existing pipeline.

**Out:** login, accounts and auth (a single-user desktop app needs none); RR's marketing homepage; public share links (`/$username/$slug`) and anything else that needs an internet-facing server; the MCP server and DeepSeek Harness plugin; RR's separate applications tracker as a second tracker; UI translations (Lingui). The PDF section-title translations stay, because they are plain data inside the PDF package.

**Later (LLM phase, its own spec):** RR's AI assistant dock and agent threads, and AI tailoring of a resume to a job, wired to Job Track's existing AI providers (`internal/ai`). This design keeps that possible: documents are plain RR JSON, and RR's JSON-patch helpers (`resume/patch.ts`, `proposals.ts`) come along with the vendored code.

## Phases

Each phase gets its own implementation plan and branch, and each ships working.

| # | Phase | Delivers |
|---|---|---|
| 0 | Groundwork | React 18 → 19.3 upgrade; vendored RR code compiling and its unit tests passing; licence and attribution update |
| 1 | Library + builder | Resumes page, full builder, all templates, PDF and JSON export, font cache, default resume in Settings feeding AI features |
| 2 | Cover letters + DOCX | Letter writer and designer; DOCX export for resumes and letters |
| 3 | Import | JSON Resume, RR v4/v5 JSON, LinkedIn export, PDF/DOCX → structured resume; Settings → Resume upload becomes Import |
| 4 | Jobs integration | Link resume/letter to a job, "Tailor for this job" copies, right-click "Score with ▸" in Discover, CSV export, ICS export, next-step hints |
| 5 | ATS checker | On the job detail page: check the linked resume (or an attached PDF) against the job description |

## Architecture

### Where the code lives

```
frontend/src/vendor/reactive-resume/
  LICENSE            upstream MIT text, unchanged
  UPSTREAM.md        commit, what was taken, every local change
  schema/ resume/ pdf/ docx/ import/ fonts/ utils/   upstream src/ trees
frontend/src/pages/Resumes/        library page (ours)
frontend/src/pages/ResumeBuilder/  builder workspace (ours)
frontend/src/pages/Letters/        letter writer (ours, phase 2)
frontend/src/lib/resumes/          store, autosave, export, thumbnail helpers (ours)
internal/app/resumes.go            documents table, repo methods, Wails bindings
internal/resumes/                  font cache (stand-alone, no app import)
```

- **Vendored code stays upstream-shaped.** Files keep their content and relative layout. Their `@reactive-resume/<pkg>/...` imports resolve through a Vite `resolve.alias` and a `tsconfig` `paths` entry pointing at `vendor/reactive-resume/<pkg>`, so imports need no rewriting. Local changes are limited to:
  - removing server-only files (`pdf/src/forme/images.node.ts`, `pdf/src/server.tsx`, `utils/src/monorepo.node.ts`, `url-security.node.ts`, `rate-limit.ts`, and anything importing Postgres, Redis, oRPC or Better Auth);
  - pointing web-font URLs at the local font cache (one function in `pdf/src/forme/fonts.ts`);
  - whatever the TypeScript and lint settings of Job Track require, kept minimal.

  Every local change is listed in `UPSTREAM.md`, so a later upstream release can be diffed and merged by hand.
- **Upstream unit tests come along** when they are pure (no Postgres, no network, no Node-only APIs) and run under Job Track's vitest. Integration tests that need Forme's WASM run too if they work under happy-dom/node, otherwise they are left out and listed in `UPSTREAM.md`.
- **Packages not taken:** `ai`, `api`, `auth`, `db`, `email`, `env`, `mcp`, `dsh-plugin`, `ui`, `config`, and `apps/server`. `apps/web` is reference only: its behaviour is rebuilt, not copied (see **Screens**).
- **Our own screens** are new code. Where a screen follows an RR screen's behaviour closely, its header comment says so (`Behaviour modelled on Reactive Resume's <path> (MIT).`).

### React 19

RR's PDF renderer uses `react-reconciler@0.34`, which needs `react@^19.3`, and RR uses React 19's `use()`. Phase 0 upgrades `react`, `react-dom` and their types to 19.3, plus `react-markdown` to 10, and fixes whatever breaks (expected to be small: Job Track uses no legacy APIs such as `defaultProps` on function components or string refs; verified during phase 0). The full frontend test suite and a manual pass over every page confirm the upgrade before any RR code lands.

### New frontend dependencies

Taken because the vendored code or the rebuilt screens need them. All are headless or document-level, with no visual style of their own:

| Package | Why | Licence |
|---|---|---|
| `@formepdf/core`, `@formepdf/react`, `react-reconciler` | PDF rendering (WASM) | MIT |
| `zod` | RR's schema | MIT |
| `docx`, `node-html-parser` | DOCX export | MIT |
| `fflate`, `fast-png`, `cjk-regex`, `css-tree`, `@bramus/specificity`, `fast-json-patch`, `wink-porter2-stemmer` | used by vendored packages | MIT |
| `pdfjs-dist` | PDF preview raster, thumbnails, ATS text extraction | Apache-2.0 |
| `@tiptap/*` | rich text in item descriptions (RR stores HTML) | MIT |
| `@codemirror/*`, `@lezer/highlight` | custom CSS editor | MIT |
| `react-colorful` | colour picker | MIT |
| `react-easy-crop` | photo crop | MIT |
| `@dnd-kit/sortable`, `@dnd-kit/utilities` | drag to reorder (core is already used) | MIT |
| `zustand`, `immer` | builder state and undo history, as RR does it | MIT |

Exact versions are pinned to RR's at commit `b3d8266` where RR has them. Not taken: `@base-ui/react`, `shadcn`, `@phosphor-icons/react`, `cmdk`, `@lingui/*`, `@tanstack/*`, `motion`, `ai`, `better-auth`, `@orpc/*`. (The PDF templates draw section icons from RR's bundled `phosphor-icons.json` data; that is part of the printed document and stays.)

## Data and storage

### Table (migration 11)

```sql
CREATE TABLE documents (
  id          TEXT PRIMARY KEY,
  kind        TEXT NOT NULL CHECK (kind IN ('resume', 'letter')),
  name        TEXT NOT NULL,
  data        TEXT NOT NULL,              -- RR document JSON, upstream format
  plain_text  TEXT NOT NULL DEFAULT '',   -- derived text for AI features
  source_id   TEXT NOT NULL DEFAULT '',   -- tailored copy: resume it was copied from
  job_id      TEXT REFERENCES jobs(id) ON DELETE SET NULL, -- tailored copy: its job
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  deleted_at  TEXT NOT NULL DEFAULT ''    -- '' = live, else in Trash
);
CREATE INDEX idx_documents_kind ON documents(kind, deleted_at, updated_at);
ALTER TABLE jobs ADD COLUMN resume_id TEXT NOT NULL DEFAULT '';
ALTER TABLE jobs ADD COLUMN letter_id TEXT NOT NULL DEFAULT '';
ALTER TABLE posting_scores ADD COLUMN resume_id TEXT NOT NULL DEFAULT '';
```

`jobs.resume_id`/`letter_id` and `posting_scores.resume_id` are plain text, not foreign keys: SQLite cannot add a foreign-key column with `ALTER TABLE`. "Delete forever" clears them in the same transaction. `''` means "none" (or, for a score, "the default resume as it stood then").

Migrations live in `internal/app/db.go` with the others; the existing backup-before-upgrade (`jobtrack.db.bak-vN`) covers this one.

### Who owns what

- **The frontend owns the document's shape.** It validates `data` with RR's `parseResumeData` (letters: `coverLetterDocumentSchema`) on load and before every save. A document that fails validation on load opens in a read-only "This document needs repair" view that offers JSON export; it is never silently rewritten.
- **Go treats `data` as opaque**: it checks the JSON is well formed and at most 5 MB, and stores it.
- **`plain_text` is made by the frontend** on every save, using RR's `buildMarkdown` (`resume/markdown.ts`); for letters, the letter body converted with its `htmlToMarkdown`, so Go never parses resume JSON and AI features keep reading text, as today.
- **Default resume:** `defaultResumeId` in `settings.json`, set in Settings → Resumes or from a card's menu. The resume text AI features use is resolved in one Go function, `resumeTextFor(resumeID string)`:
  1. the given resume, when one is given and it is live;
  2. else the default resume, when set and live;
  3. else today's uploaded resume text (`profile.resume_text`), so existing users lose nothing.
  
  Interviews, question plans, scorecards and match scoring all call it instead of reading `profile.resume_text` directly.

### Saving, undo, trash

- The builder autosaves 800 ms after the last change and on leaving the page, shown as "Saving… / Saved" in its top bar (the same pattern as job notes).
- Undo/redo is an in-memory history of JSON patches (RR's `patch.ts`), up to 100 steps, cleared when the builder closes.
- Delete → Trash (`deleted_at` set). Trash offers Restore, Delete forever, and Empty trash; the last two confirm via `ConfirmDialog`. Trashing the default resume clears `defaultResumeId` (with a toast saying so). A job whose linked document is in Trash shows it with "(in Trash)" and a Restore link.
- Duplicate copies `data` under a new id and "Copy of <name>".

### Pictures

Profile photos are stored inside `data` as a data URL, cropped in `react-easy-crop` and scaled to at most 512 px (JPEG, quality 0.9) before saving. Documents stay self-contained, so JSON export and import need no side files. Remote picture URLs in imported documents are fetched once through Go (`FetchPicture`, http/https only, refuses private/loopback addresses, 5 MB cap) and stored as data URLs; Forme never fetches from the network.

### Fonts

- RR's `fonts/webfontlist.json` lists the Google Fonts files each family needs.
- `internal/resumes.FontCache` downloads a font file once into `%USERPROFILE%\.jobtrack\fonts\` and serves it. Wails' asset server routes `/fonts/<path>` to it (`assetserver.Options.Handler` in `internal/app/run.go`).
- **Allowlist:** only files whose URL appears in the embedded `webfontlist.json` and whose host is `fonts.gstatic.com` are fetched. Anything else is a 404. File names on disk are a hash of the URL, so no path from a request reaches the filesystem.
- Offline with an uncached font: the PDF falls back to the template's standard font (Helvetica/Times/Courier) and the builder shows a small warning chip "Font X unavailable offline".

## Screens

### Look

Built only from Job Track parts: `glass` and `field` utilities, `Panel`, `Modal`, `ConfirmDialog`, `ContextMenu`, `Chip`, `IconButton`, `PageTitle`, `Toaster`, lucide icons, Plus Jakarta Sans / JetBrains Mono, the existing type scale and accent glow. Third-party headless widgets are styled with our tokens:

- TipTap: toolbar of our `IconButton`s; content area uses `field` styling.
- CodeMirror: a dark theme generated from the `@theme` tokens, JetBrains Mono.
- `react-colorful`: inside our popover, swatches with `line` borders, hex input as `field`.
- `react-easy-crop`: inside our `Modal`, with our buttons.

### Nav rail

Pipeline · Discover · **Resumes** (`FileText`) · Offers · Interviews · Settings. Route `/resumes`.

### Resumes page (`/resumes`)

- `PageTitle` "Resumes", tabs **Resumes · Cover letters · Trash**, a filter box, and a **New** button.
- Cards in a responsive grid: first-page thumbnail (rendered once per save with pdf.js into a small PNG, cached in memory), name, template, "updated 2h ago". The default resume has a ★ chip; a tailored copy has an accent chip "Tailored · <Company> — <Title>" that links to the job.
- Right-click (existing `ContextMenu`): Open, Rename, Duplicate, Set as default (resumes), Tailor for a job… (phase 4), Export ▸ PDF / DOCX (phase 2) / JSON, Move to Trash.
- **New** opens a `Modal`: Blank · Start from sample · Import (phase 3), then a template grid of thumbnails, then a name.
- Empty state: a short line and the New button.

### Builder (`/resumes/:id`)

Full height inside the app shell; behaviour follows RR's builder (`apps/web/src/routes/builder/$resumeId`).

- **Top bar:** back to Resumes, editable name, Saving/Saved, undo/redo, zoom (fit / 50–200%), ★ Set as default, Export menu.
- **Left pane, Content:** Basics, Picture, Summary, then every section as a collapsible glass card (Experience, Education, Skills, Projects, Profiles, Languages, Interests, Awards, Certifications, Publications, Volunteer, References, plus custom sections). Items reorder by drag (`@dnd-kit/sortable`); each opens a `Modal` form with `field` inputs and the TipTap editor for descriptions. Section menu: rename, hide/show, columns, remove; "Add custom section".
- **Centre, canvas:** paper pages rendered live by Forme (re-rendered 300 ms after a change, off the input path) on the `void` background with a soft accent shadow; page navigation at the bottom.
- **Right pane, Design:** Template (thumbnail grid), Layout (drag sections between main/sidebar columns and pages), Typography (font family/size/line height for body and headings, with the font picker from RR's font list), Colours (primary/text/background, level indicator style), Page (format A4/Letter, margins, spacing), Custom CSS (CodeMirror), Notes (private, not printed).
- **Hotkeys** (as RR): Ctrl+Z / Ctrl+Shift+Z undo/redo, Ctrl+= / Ctrl+- zoom, Ctrl+S export PDF.
- **Narrow windows** (< 1100 px): side panes become drawers toggled from the top bar, matching how the nav rail collapses.

### Cover letters (phase 2, `/letters/:id`)

Same shell as the builder: Write pane (recipient, date, body in TipTap), canvas, Design pane (template, typography, colours, page). Behaviour follows RR's `routes/builder/letter`.

### Settings

New side-menu item **Resumes**:
- Default resume picker (thumbnail + name; "None — use uploaded text").
- Phase 3: Import button (same flow as New → Import), and the old upload moves under a collapsed "Legacy uploaded resume (used when no default is set)".

### Job detail (phase 4+)

A **Documents** panel next to Files:
- Linked resume and letter, each with thumbnail, name, Change…, Open in builder, Export PDF.
- "Tailor for this job": duplicates the chosen resume as "<name> · <Company>", sets `source_id` and `job_id`, links it to the job, and opens it in the builder.
- **Run ATS check** (phase 5).

### Discover (phase 4)

- Posting right-click gains **Score with ▸** listing live resumes (default marked ★). Choosing one re-grades that posting against that resume's text and stores `resume_id` with the score.
- The score breakdown names the resume it was graded against ("Graded against: Backend — 2026").
- Normal searches keep using the default resume. The match fingerprint already includes the resume text, so changing the default marks old scores outdated as today.

### Pipeline additions (phase 4)

From RR's application tracker (`apps/web/src/features/applications`), adapted to Job Track's jobs, stages and interviews:
- **Export CSV** of the pipeline (table view toolbar).
- **Export interviews to calendar (.ics)** on the job detail Interviews panel and for all upcoming interviews.
- **Next-step hint** on each card ("Follow up — applied 9 days ago"), using RR's `next-step.ts` rules mapped to Job Track stages.

### ATS checker (phase 5)

On the job detail Documents panel: **Run ATS check** renders the linked resume to PDF (or uses a PDF chosen from the job's attached files), extracts it with pdf.js (RR's `extract-client.ts` approach), runs RR's `ats-pdf` analysis and `jd/match.ts` keyword match against the job description, and shows RR's report inline: overall result, checks grouped by severity (success / warn / danger colours), and matched / missing keywords. The last report is saved per job (`ats_reports` table, added in phase 5's migration) so it reappears without re-running.

## Licence and attribution (phase 0)

Done in the first commit that contains RR code, so the repo is never out of compliance.

1. `frontend/src/vendor/reactive-resume/LICENSE`: RR's MIT licence, verbatim, with `Copyright (c) 2026 Amruth Pillai`.
2. Every vendored file gets a header (or keeps its existing one) reading:
   `// Derived from Reactive Resume (https://github.com/reactive-resume/reactive-resume), commit b3d8266.` / `// Copyright (c) 2026 Amruth Pillai. SPDX-License-Identifier: MIT` / `// Modified by Michael P. Burgus, 2026.` (the last line only on files with local changes).
3. Repo-root `LICENSE`: after the existing third-party paragraph, add:
   > `frontend/src/vendor/reactive-resume/` contains code derived from Reactive Resume, Copyright (c) 2026 Amruth Pillai, used under the MIT License. Its license is in that directory and in the app's Open-source licenses list.
4. **Licences page:** `internal/licensegen` gains a third group, `vendored`, read from each `frontend/src/vendor/*/LICENSE` plus its `UPSTREAM.md` (name, upstream URL, commit). The generated JSON becomes `{ app, go, npm, vendored }`; the page lists the vendored group first under Libraries ("Included source code"). The staleness test covers it. Reactive Resume is removed from `THANKS` in `credits.ts`.
5. **README:** a "Resumes" feature bullet saying the builder, templates, importers and ATS checker are built on Reactive Resume, with a link; and `vendor/` added to the project-layout block.
6. The new npm dependencies (Forme, docx, pdf.js, TipTap…) appear in the generated Libraries list automatically; the staleness test fails until `go generate ./...` is re-run. pdf.js is Apache-2.0; its NOTICE, if shipped, is appended by the existing generator.
7. The 2026-10-08 licences-page spec gets a one-line note that RR moved from Thanks to Libraries.

## Error handling

- **Validation failure on load:** read-only repair view with JSON export (see Data). Never auto-rewritten.
- **Save failure** (Go error): the top bar shows "Not saved" in `danger` with Retry; edits stay in memory; leaving the page asks to confirm.
- **PDF render failure** (Forme throws, e.g. bad custom CSS): the canvas keeps the last good render, with a `warn` banner showing the error; export is disabled until it renders again.
- **Font download failure:** fallback font plus chip (see Fonts); never blocks rendering.
- **Import failure:** the importer's error message in the import modal, nothing created. Partial imports open in the builder with a toast listing skipped fields.
- **ATS check on a PDF that can't be read** (password, too large, scanned with no text): RR's specific messages (`PdfPasswordRequiredError`, `PdfTooLargeError`, no-text-layer).
- All Go-side failures surface through the existing `errorMessage` + toast path; nothing fails silently.

## Testing

- **Vendored:** upstream pure unit tests run under `npm test`. A failing upstream test after a local change is a bug in the change.
- **Go:** `resumes_test.go` covers CRUD, trash/restore/purge (and clearing job links and `defaultResumeId`), size cap, `resumeTextFor` fallback order, and the migration. `internal/resumes` tests the font allowlist (rejects non-listed URLs, other hosts, path tricks) against a fake server, and the cache hit path.
- **Frontend (ours):** store and autosave debounce, undo/redo, plain-text generation on save, thumbnail cache invalidation, Score-with menu contents, next-step mapping, CSV and ICS output.
- **Round trips:** every template renders the sample resume to a non-empty PDF; JSON export → import gives equal data; DOCX export opens (zip with `word/document.xml`).
- **Licences:** the existing staleness test, plus a test that every file under `vendor/reactive-resume` carries the attribution header.
- **Manual pass per phase** in `wails dev`: each new screen at a wide and a narrow window size, checked against the existing pages for spacing, type and colour.
- `bash tools/verify.sh` green before each phase merges.

## Open questions

None blocking. Decided during design:
- Merge RR's application tracker into the pipeline rather than port it (user, 2026-10-10).
- Rebuild screens natively; vendor only engine packages (user, 2026-10-10).
- Multiple resumes, default set in Settings, per-posting "Score with" (user, 2026-10-10).
