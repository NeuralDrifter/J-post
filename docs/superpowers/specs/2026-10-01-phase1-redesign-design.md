# Job_Track Phase 1 Redesign — Design Spec

**Date:** 2026-10-01
**Status:** Draft for review

## 1. Purpose

Job_Track is primarily a tool for the owner's own active job search, and secondarily a portfolio piece. Phase 1 makes it a solid daily-use tracker with a polished UI. It is built so that later phases (offer/comp comparison, AI features) can be added without restructuring.

**Visual and feature reference:** the Google Stitch mockup in `example_only_non_functioning_demo content/stitch_careerpilot_ai_tracker/`, specifically `obsidian_lumina/DESIGN.md` and the PRD. The mockup is reference only. None of its HTML is copied, and no fake or placeholder metrics ship in the app.

### Success criteria
- Every number shown in the UI comes from real data.
- Moving a job between stages takes one drag. Stage history records itself.
- Discover works from the built `Job_Track.exe` launched from any folder, not just under `wails dev`.
- Existing `~/.jobtrack/data.json` data is imported with no loss.

### In scope
1. Obsidian Lumina dark theme and app shell
2. SQLite data model with stage history, contacts, interviews and attachments
3. Pipeline page: metrics, kanban with drag-and-drop, table view, filters
4. Application detail page
5. Discover page rebuild
6. Fixes for existing bugs (see §7)

### Out of scope (later phases)
- Offer / compensation comparison (Phase 2 candidate)
- AI features: fit scores, interview battle cards, resume tailoring, co-pilot chat, drafted emails
- Mock interview chamber and network/referral radar (not planned)

## 2. Architecture

- **Shell:** Wails v2 desktop app (unchanged).
- **Backend:** Go, with a pure-Go SQLite driver `modernc.org/sqlite`. No cgo, so builds don't depend on which gcc is on PATH.
- **Frontend:** React 18 + TypeScript. Tooling is upgraded to Vite 6 and TypeScript 5, plus:
  - Tailwind CSS, with the Obsidian Lumina tokens defined as theme values
  - `react-router` in hash mode, for Wails compatibility
  - `@dnd-kit` for drag-and-drop
  - `react-markdown` for rendering notes
  - Vitest for frontend tests
- **Fonts:** Plus Jakarta Sans and JetBrains Mono, bundled locally (no CDN), so the app works offline.

### Go file layout
| File | Responsibility |
|---|---|
| `main.go` | Wails bootstrap (window size raised to 1440×900, min 1100×700) |
| `app.go` | Thin methods bound to the frontend; delegates to the repos |
| `db.go` | Open DB, versioned migrations, pre-migration backup |
| `legacy_import.go` | One-time `data.json` import |
| `jobs.go` | Job CRUD + status change (writes the stage event) |
| `contacts.go`, `interviews.go`, `attachments.go` | Per-entity CRUD |
| `metrics.go` | Dashboard metric queries |
| `discover.go` | JobSpy subprocess + Adzuna client, normalization, de-dupe |
| `settings.go` | Settings (stays a JSON file; it's small and not relational) |
| `scraper.py` | Embedded into the binary via `go:embed`, written to a temp file at runtime |

`store.go` is deleted once its replacement is in place.

### Frontend layout
```
frontend/src/
  main.tsx, App.tsx            router + shell only
  theme/                       tailwind tokens, fonts
  components/                  AppShell, NavRail, TopBar, Toast, ConfirmDialog, StatusChip, ...
  pages/Pipeline/              MetricsRow, NextUpBanner, Board, JobCard, TableView, FilterBar, CloseReasonPicker
  pages/JobDetail/             Header, StageTimeline, NotesPad, Description, ContactsPanel, InterviewsPanel, FilesPanel
  pages/Discover/              SearchForm, ResultsList, PreviewPane
  pages/Settings/
  lib/                         api wrappers (error → toast), formatting & date helpers
```

## 3. Data model

DB file: `~/.jobtrack/jobtrack.db`. All IDs are random hex strings (same as today). Timestamps are stored as RFC3339 text.

### `jobs`
| Column | Type | Notes |
|---|---|---|
| id | TEXT PK | |
| company | TEXT NOT NULL | |
| position | TEXT NOT NULL | |
| status | TEXT NOT NULL | `wishlist` / `applied` / `interviewing` / `offer` / `closed` |
| close_reason | TEXT | `rejected` / `withdrawn` / `ghosted` / `declined`; set only when status = closed |
| location | TEXT | |
| work_mode | TEXT | `remote` / `hybrid` / `onsite` / empty |
| salary_min, salary_max | INTEGER | annual USD; null if unknown |
| salary_text | TEXT | raw text as posted (e.g. "$45–55/hr") |
| url | TEXT | posting URL |
| source | TEXT | `linkedin` / `indeed` / `zip_recruiter` / `adzuna` / `manual` |
| description | TEXT | full job description |
| date_posted | TEXT | from source, if known |
| date_applied | TEXT | YYYY-MM-DD |
| follow_up_on | TEXT | YYYY-MM-DD, optional |
| notes | TEXT | markdown |
| created_at, updated_at | TEXT | |

### `stage_events`
id, job_id (FK, cascade delete), from_status (null on creation), to_status, close_reason, at, note.

A row is written on job creation and on every status change. Status changes go only through `ChangeStatus(jobID, newStatus, closeReason, note)`, so history cannot be skipped. Moving a job into `applied` with an empty `date_applied` sets it to today.

### `contacts`
id, job_id (FK cascade), name, role, email, phone, linkedin_url, notes.

### `interviews`
id, job_id (FK cascade), kind (`phone_screen` / `technical` / `behavioral` / `onsite` / `panel` / `other`), scheduled_at, duration_min, location_or_link, notes, completed (bool).

### `attachments`
id, job_id (FK cascade), label, file_name, stored_path, added_at.

Adding a file copies it into `~/.jobtrack/files/<job_id>/`. Deleting the attachment, or the job, removes the copied file. Opening a file uses the OS default app (`BrowserOpenURL` with a `file://` URL, or `exec` of `cmd /c start`).

### `schema_version`
A single row holding the current migration number.

### Legacy import
On startup, if `data.json` exists and the `jobs` table is empty:
1. Import each record. `Rejected` becomes `closed` + `rejected`, and the other statuses are lowercased. `notes` and `dateApplied` are kept. Each record gets one `stage_event` (`null → status`) dated from its `updatedAt`.
2. Rename `data.json` to `data.json.bak`.

The import runs in a single transaction. On failure nothing is renamed and the error is shown in the UI.

## 4. Metrics (computed in `metrics.go`)

| Metric | Definition |
|---|---|
| Active | jobs with status in (applied, interviewing, offer) |
| Response rate | jobs that ever reached interviewing/offer ÷ jobs that ever reached applied (from `stage_events`). Shown as "—" when the denominator is 0. Jobs closed directly from applied with `ghosted`/`rejected` count in the denominator only. |
| Interviews this week | non-completed interviews with scheduled_at in the current Mon–Sun week (local time) |
| Follow-ups due | jobs where `follow_up_on ≤ today`, OR status = applied and the latest stage event is older than N days (N in settings, default 7) |
| Days in stage | today − the job's latest stage event date; shown per card, amber when > N |
| Next up | the soonest non-completed interview with scheduled_at ≥ now, with its job |

## 5. UI

The theme follows `obsidian_lumina/DESIGN.md`: dark glass surfaces, an indigo primary, cyan for interview/telemetry, emerald for offers, amber for stale items, and muted slate for closed. Plus Jakarta Sans is used for UI text and JetBrains Mono for numbers, dates and chips.

### App shell
- A left nav rail with Pipeline, Discover and Settings.
- A top bar with a summary chip ("N active · M interviews this week"), a quick search box (filters the board by company/position) and a **+ New Application** button.
- Toasts appear bottom-right.

### Pipeline page
- **MetricsRow:** 4 cards (Active, Response rate, Interviews this week, Follow-ups due).
- **NextUpBanner:** shown only when an upcoming interview exists. Clicking it opens that job.
- **Board:** 5 columns.
  - Drag a card to change its status.
  - Dropping on Closed opens a reason picker (cancel = no change).
  - The Closed column is collapsible, and its cards are dimmed with a reason tag.
- **JobCard:** company-initials avatar, position, company, salary range, location/work mode, days-in-stage chip, follow-up-due flag, next interview (if any). Clicking the card opens its detail page.
- **TableView** (toggle): sortable by company, position, status, salary, date applied and days in stage.
- **FilterBar:** text search, work mode and source. These apply to both the board and the table.
- **Quick-add modal:** company, position, status, URL, location, work mode, salary. On save it navigates to the new job's detail page.

### Job detail page (`#/jobs/:id`)
- **Header:** position, company, status chip (changeable from a dropdown, which runs the same `ChangeStatus` path), salary, location, "Open posting" link, an Edit button for the core fields, and Delete (with a confirm dialog).
- **Left column:** StageTimeline built from `stage_events`, newest last, with an optional note per event.
- **Center column:**
  - Description (collapsible, plain text with preserved line breaks).
  - NotesPad: markdown textarea with a preview toggle. It autosaves 800ms after typing stops and shows a "Saved" indicator.
- **Right column:**
  - ContactsPanel: add / edit / delete; email and LinkedIn links are clickable.
  - InterviewsPanel: add / edit / delete / mark complete; listed upcoming first.
  - FilesPanel: attach via the native file dialog (Wails `OpenFileDialog`), open, remove.

### Discover page
- **SearchForm:** title, location, a remote-only toggle, and source checkboxes (Indeed, LinkedIn, ZipRecruiter, Adzuna). Adzuna is disabled with a hint if its keys aren't set.
- **ResultsList:** title, company, location, salary, posted date and source badges.
  - Results matching an already-tracked job (case-insensitive company + position, or the same URL) show "Tracking · <status>" instead of a save button.
- **PreviewPane:** the selected result's full description, salary details, link to the original posting, and a **Save to Wishlist** button. Saving creates a job with every available field populated.
- **Per-source failures** show as a dismissible warning above the results ("LinkedIn failed: <message>"). Other sources still display.

### Settings page
- Adzuna App ID / Key.
- Python path, with a **Test** button that runs `python -c "import jobspy"` and reports the result.
- Follow-up threshold in days (default 7).
- Read-only data folder path, with an "Open folder" button.

## 6. Discover backend

### Python resolution
The first match wins:
1. The settings override.
2. `<exe dir>\venv\Scripts\python.exe`
3. `<cwd>\venv\Scripts\python.exe` (dev mode)

If none is found, the error names all the paths that were checked.

### Scraper
- `scraper.py` is embedded with `go:embed` and written to `os.TempDir()` before each run.
- **Arguments:** search term, location, remote flag, and a comma-separated list of sites.
- **Concurrency:** it runs each requested site separately, so one site failing doesn't kill the others.
- **Output:** JSON `{ "jobs": [...], "errors": { "linkedin": "..." } }`.
- **Fields per job:** title, company, location, is_remote, min_amount, max_amount, interval, currency, description, date_posted, job_url, site.

### Adzuna
- Runs concurrently with JobSpy in Go.
- Maps `salary_min`/`salary_max`, `description` and `created`.
- Fixed on `results_per_page=20`.

### Normalization (Go)
- **Salary:** hourly → ×2080, monthly → ×12, weekly → ×52. The original is kept in `salary_text`, and annualized values from non-yearly pay are flagged in the UI with "≈ annualized".
- **Work mode:** `is_remote` true → `remote`; otherwise empty, and the user sets it.
- **De-dupe within results:** key = lowercase trimmed company + position. Duplicates are merged and their source badges combined.

### Timeouts
JobSpy subprocess 90s, Adzuna 20s. On timeout the subprocess is killed and the timeout reported as that source's error.

## 7. Existing bugs fixed in Phase 1
1. **Unreachable modals.** In `App.tsx`, the early returns for `showSettings`/`showSearch` make the modal versions unreachable. Resolved by the page rebuild.
2. **Relative Python path.** `ScrapeJobs` uses a relative venv path and `scraper.py`, so it fails from the built exe. Resolved by §6.
3. **Search-result fields dumped into notes.** Saving a result puts URL, location and source into `notes`. Resolved by the real fields.
4. **Silent errors.** `alert()`/`confirm()` and console-only errors are replaced by toasts and an in-app confirm dialog.

## 8. Error handling
- Every Go method returns `error`. The frontend `lib/api` wrapper catches it and shows a toast with the message.
- Migrations:
  - Copy `jobtrack.db` to `jobtrack.db.bak-v<N>` before applying migration N.
  - Each migration runs in a transaction.
  - If the DB fails to open or migrate, the app shows a full-screen error with the DB path instead of a blank board.
- Attachment copy failures leave no DB row (the file is copied first, then the row inserted; on insert failure the file is removed).
- Foreign keys enabled (`PRAGMA foreign_keys=ON`). WAL mode is on for robustness.

## 9. Testing
- **Go (`go test ./...`)**, each test using a fresh temp-dir DB. Coverage:
  - Migrations from empty
  - Legacy import (including the Rejected mapping and the `.bak` rename)
  - Job CRUD
  - `ChangeStatus` writes events and sets `date_applied`
  - Cascade deletes, including the attachment files
  - Each metric, including the zero-denominator case and the follow-up rules
  - Salary normalization
  - De-dupe and tracked-job matching
  - Python path resolution order
- **Frontend (Vitest):** salary/date formatting and days-in-stage helpers.
- **Manual verification before calling Phase 1 done:**
  1. `wails build`.
  2. Copy `Job_Track.exe` to a different folder (with the venv override set in Settings), launch it and run a Discover search.
  3. Save a result, drag it through the stages to Closed, and confirm the timeline and metrics update.

## 10. Phase 2+ hooks (no work now, just don't block)
- Offer details will live in a new `offers` table keyed by job_id, so `jobs` stays unchanged.
- AI features will read `jobs.description` plus a future `profile` (resume) table. The detail page's right column and the Pipeline page have room for an AI panel.
