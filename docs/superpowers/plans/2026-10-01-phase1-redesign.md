# Job_Track Phase 1 Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the basic Wails job tracker into a daily-use, portfolio-quality app. It gets a SQLite data model with stage history, contacts, interviews and files; a dark "Obsidian Lumina" UI with a metrics dashboard, drag-and-drop board, table view and job detail page; and a Discover page that works from the built `.exe`.

**Architecture:** The Go backend (package `main`, flat files) owns all data and logic. A `Repo` wraps a pure-Go SQLite DB, and `App` is a thin layer of methods bound to the frontend. The React frontend is split into pages and components, talks to Go only through the Wails-generated bindings re-exported from `src/lib/backend.ts`, and refreshes via a tiny global "data changed" signal. Discover runs one embedded Python JobSpy script per site plus the Adzuna HTTP API concurrently, then normalizes and de-duplicates the results in Go.

**Tech Stack:**
- **Backend:** Go 1.26, Wails v2.12, `modernc.org/sqlite` (no cgo).
- **Frontend:** React 18, TypeScript 5, Vite 6, Tailwind CSS v4, react-router v7 (HashRouter), @dnd-kit/core, react-markdown v9, lucide-react, Fontsource fonts.
- **Tests:** Go `testing`, Vitest 3.
- **Scraping:** Python 3.13 venv with python-jobspy 1.1.82.

**Spec:** `docs/superpowers/specs/2026-10-01-phase1-redesign-design.md`. Read it before starting any task.

## Global Constraints

- **Platform:**
  - Windows; the user's primary shell is PowerShell.
  - Commands below are written for **Git Bash**. They must also work from PowerShell, so avoid bash-only syntax in anything the user runs.
- **Go module and package:** module `jobtrack`; everything in `package main` at the repo root (Wails convention).
- **Bindings:** run every `wails` command from the repo root. Regenerate bindings with `wails generate module` after changing any exported `App` method or bound struct.
- **No cgo.** The SQLite driver is `modernc.org/sqlite` only. Never add `mattn/go-sqlite3`.
- **DB connections:**
  - `db.SetMaxOpenConns(1)`.
  - Inside a transaction, every query must go through the `tx`. Querying `r.db` while a `tx` is open deadlocks.
  - Always close `rows` before issuing the next query.
- **Time formats:**
  - Timestamps are stored as UTC strings with layout `2006-01-02T15:04:05.000Z` (`tsLayout`). This matches JavaScript `Date.prototype.toISOString()` exactly.
  - Calendar dates (`date_applied`, `follow_up_on`) are local `YYYY-MM-DD` (`dateLayout`).
- **Status values:** `wishlist`, `applied`, `interviewing`, `offer`, `closed`.
- **Close reasons:** `rejected`, `withdrawn`, `ghosted`, `declined`.
- **Work modes:** `remote`, `hybrid`, `onsite`, or empty.
- **Sources:** `linkedin`, `indeed`, `zip_recruiter`, `adzuna`, `manual`.
- **Interview kinds:** `phone_screen`, `technical`, `behavioral`, `onsite`, `panel`, `other`.
- **Go list methods** return an empty slice, never `nil`, so the frontend never receives `null` for a list.
- **Frontend backend access:**
  - Import Go methods, `main` model types and `BrowserOpenURL` only from `src/lib/backend.ts`.
  - Wrap calls in `api()` / `apiOk()` from `src/lib/api.ts`; errors become toasts.
  - Never use `alert()` or `confirm()`.
- **Wails model classes:**
  - Classes that contain nested structs (`JobSummary`, `Metrics`, `DiscoverResponse`, `NextUp`) have a `convertValues` method, so object spreads are not assignable to them. Rebuild them with `main.X.createFrom({...})`.
  - Primitive-only models (`Job`, `Contact`, `Interview`, `Settings`, `DiscoverQuery`) can be passed as plain object literals.
- **Theme:**
  - Dark only. Colors come from the Tailwind `@theme` tokens in `src/index.css` (`void`, `base`, `panel`, `raised`, `line`, `line-strong`, `ink`, `ink-2`, `ink-3`, `accent`, `accent-2`, `info`, `success`, `warn`, `danger`).
  - Fonts: `font-sans` (Plus Jakarta Sans) for text, `font-mono` (JetBrains Mono) for numbers, dates and chips.
  - No CDN assets.
- **Responsive breakpoints:** use these arbitrary variants exactly:
  - `min-[1100px]:` for the nav rail labels and the Discover split.
  - `min-[1200px]:` for the detail page's three columns.
  - Every page must be usable at 900×600.
- **No fake data.** Never render placeholder metrics. An unknown value renders as `—` or is hidden.
- **Embedding:** `go test` compiles `main.go`, which embeds `frontend/dist`, so `frontend/dist` must exist. Run `npm run build` in `frontend/` once if it is missing.
- **Commits:**
  - Commit at the end of every task.
  - Every commit message ends with a blank line, then `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.

## Review Focus

These are the five input conditions most likely to bite in real use. Each is pinned by a test in the owning task:

1. **Non-ASCII job text from JobSpy** (em dashes, accented company names, emoji) passing through a Windows pipe. Expected: it arrives intact; the script emits ASCII-escaped JSON on its last stdout line, after any log noise. Test: `TestParseScraperOutputUnicodeAndNoise` (Task 7).
2. **Partial or odd salary data**: only a min, only a max, zeros, an hourly rate, an unknown interval. Expected: sensible annual numbers or none, never a crash or `$0`. Tests: `TestNormalizeSalary` (Task 7), `formatSalary` cases (Task 8).
3. **Dropping a card back into its own column**, or re-choosing the same status. Expected: nothing changes and no duplicate timeline entry. Tests: `TestChangeStatusSameIsNoop` (Task 2) and the same-column guard in `Board.onDragEnd` (Task 10).
4. **Messy legacy `data.json`**: unknown status strings, empty company, a bad date. Expected: everything imports; unknown statuses go to Wishlist; nothing is lost. Test: `TestImportLegacyMessyRecords` (Task 5).
5. **Attaching files with spaces, unicode or duplicate names.** Expected: both copies are kept separately and open correctly. Test: `TestAttachmentDuplicateNamesWithSpaces` (Task 3).

## File Map

**Backend (repo root):**
| File | Responsibility |
|---|---|
| `db.go` | `openDB`, migrations, backup, `Repo`, shared helpers (`newID`, `ts`, `ErrNotFound`, scanner interfaces) |
| `jobs.go` | `Job`, `StageEvent`, job CRUD, `ChangeStatus`, `UpdateJobNotes` |
| `contacts.go` | `Contact` CRUD |
| `interviews.go` | `Interview` CRUD |
| `attachments.go` | `Attachment` add/list/delete, file copying |
| `metrics.go` | `JobSummary`, `Metrics`, day/week math, follow-up rules |
| `legacy_import.go` | One-time `data.json` import |
| `settings.go` | `Settings` JSON file (rewritten) |
| `window.go` | `planWindow`, `pickScreen`, and the `domReady`/`beforeClose` window lifecycle |
| `discover.go` | Discover types, Python resolution, JobSpy runner, Adzuna client, normalization, de-dupe, orchestration |
| `proc_windows.go` / `proc_other.go` | Hide the subprocess console window; open files with the OS |
| `scraper.py` | Embedded single-site JobSpy runner (rewritten) |
| `app.go` | `App` and every bound method (rewritten) |
| `main.go` | Wails options (modified) |
| `store.go` | **Deleted** in Task 9 |
| `*_test.go` | One test file per source file, plus `testhelpers_test.go` |

**Frontend (`frontend/src/`):**
| Path | Responsibility |
|---|---|
| `main.tsx`, `index.css`, `App.tsx` | Entry, theme tokens and utilities, router and startup gate |
| `lib/backend.ts` | Re-exports Wails bindings, models, `BrowserOpenURL` |
| `lib/api.ts`, `lib/toast.ts`, `lib/events.ts`, `lib/useLoad.ts`, `lib/prefs.ts` | Calls, toasts, data-changed signal, loader hook, localStorage prefs |
| `lib/format.ts` | Labels and formatting helpers |
| `lib/filter.ts` | Board/table filtering and sorting |
| `lib/jobDraft.ts` | Form draft ↔ `Job`, `DiscoverResult` → `Job` |
| `components/` | `AppShell`, `NavRail`, `TopBar`, `Modal`, `Chip`, `Panel`, `Toaster`, `ConfirmDialog`, `StartupErrorScreen`, `JobForm`, `CloseReasonPicker`, `Markdown` |
| `pages/Pipeline/` | `PipelinePage`, `MetricsRow`, `NextUpBanner`, `Board`, `JobCard`, `TableView`, `FilterBar` |
| `pages/JobDetail/` | `JobDetailPage`, `JobHeader`, `StageTimeline`, `DescriptionCard`, `NotesPad`, `ContactsPanel`, `InterviewsPanel`, `FilesPanel` |
| `pages/Discover/` | `DiscoverPage`, `SearchForm`, `ResultsList`, `PreviewPane` |
| `pages/Settings/SettingsPage.tsx` | Settings |

---

### Task 1: Database foundation

**Files:**
- Create: `db.go`, `db_test.go`, `testhelpers_test.go`
- Modify: `go.mod`, `go.sum` (via `go get`)

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `openDB(path string) (*sql.DB, error)` and `openDBWith(path string, list []string) (*sql.DB, error)`
  - `var migrations []string`, `schemaVersion(db *sql.DB) (int, error)`
  - `type Repo struct{ db *sql.DB; filesDir string; now func() time.Time }`, `NewRepo(db *sql.DB, filesDir string) *Repo`
  - `newID() string`, `ts(time.Time) string`, `const tsLayout`, `const dateLayout`, `var ErrNotFound`
  - interfaces `rowScanner`, `execer`, `querier`; helpers `nullInt(*int64) any`, `expectOneRow(sql.Result, error, what, id string) error`
  - Test helpers: `newTestRepo(t) *Repo`, `setNow(r *Repo, y int, m time.Month, d, hour int)`

- [ ] **Step 1: Add the SQLite driver**

Run: `go get modernc.org/sqlite@latest`
Expected: `go.mod` gains a `modernc.org/sqlite` require line. The `go` directive may be bumped automatically, which is fine.

- [ ] **Step 2: Write the test helpers and failing tests**

`testhelpers_test.go`:
```go
package main

import (
	"path/filepath"
	"testing"
	"time"
)

// newTestRepo opens a fresh migrated database in a temp dir with the clock fixed
// at 2026-10-01 12:00 local time (a Thursday).
func newTestRepo(t *testing.T) *Repo {
	t.Helper()
	dir := t.TempDir()
	db, err := openDB(filepath.Join(dir, "test.db"))
	if err != nil {
		t.Fatalf("openDB: %v", err)
	}
	t.Cleanup(func() { db.Close() })
	r := NewRepo(db, filepath.Join(dir, "files"))
	setNow(r, 2026, time.October, 1, 12)
	return r
}

// setNow fixes the repo clock to the given local date and hour.
func setNow(r *Repo, y int, m time.Month, d, hour int) {
	fixed := time.Date(y, m, d, hour, 0, 0, 0, time.Local)
	r.now = func() time.Time { return fixed }
}
```

`db_test.go`:
```go
package main

import (
	"database/sql"
	"os"
	"path/filepath"
	"testing"
)

func TestOpenDBCreatesSchema(t *testing.T) {
	r := newTestRepo(t)
	for _, table := range []string{"jobs", "stage_events", "contacts", "interviews", "attachments", "schema_version"} {
		var name string
		err := r.db.QueryRow(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`, table).Scan(&name)
		if err != nil {
			t.Errorf("table %s missing: %v", table, err)
		}
	}
	v, err := schemaVersion(r.db)
	if err != nil || v != len(migrations) {
		t.Fatalf("schema version = %d, %v; want %d", v, err, len(migrations))
	}
}

func TestForeignKeysEnabled(t *testing.T) {
	r := newTestRepo(t)
	var on int
	if err := r.db.QueryRow(`PRAGMA foreign_keys`).Scan(&on); err != nil || on != 1 {
		t.Fatalf("foreign_keys = %d, %v; want 1", on, err)
	}
}

func TestReopenIsIdempotentAndSkipsBackup(t *testing.T) {
	path := filepath.Join(t.TempDir(), "j.db")
	db, err := openDB(path)
	if err != nil {
		t.Fatal(err)
	}
	db.Close()
	db, err = openDB(path)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	if v, _ := schemaVersion(db); v != len(migrations) {
		t.Fatalf("version = %d", v)
	}
	if matches, _ := filepath.Glob(path + ".bak-*"); len(matches) != 0 {
		t.Fatalf("unexpected backups: %v", matches)
	}
}

func TestMigrationBacksUpExistingDB(t *testing.T) {
	path := filepath.Join(t.TempDir(), "m.db")
	first := []string{`CREATE TABLE a (x INTEGER); INSERT INTO a VALUES (42);`}
	db, err := openDBWith(path, first)
	if err != nil {
		t.Fatal(err)
	}
	db.Close()

	second := []string{first[0], `CREATE TABLE b (y INTEGER);`}
	db, err = openDBWith(path, second)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()

	backup := path + ".bak-v2"
	if _, err := os.Stat(backup); err != nil {
		t.Fatalf("backup missing: %v", err)
	}
	bdb, err := sql.Open("sqlite", backup)
	if err != nil {
		t.Fatal(err)
	}
	defer bdb.Close()
	var x int
	if err := bdb.QueryRow(`SELECT x FROM a`).Scan(&x); err != nil || x != 42 {
		t.Fatalf("backup data x = %d, %v", x, err)
	}
	var n int
	bdb.QueryRow(`SELECT COUNT(*) FROM sqlite_master WHERE name='b'`).Scan(&n)
	if n != 0 {
		t.Fatal("backup should predate migration 2")
	}
}

func TestFailedMigrationRollsBack(t *testing.T) {
	path := filepath.Join(t.TempDir(), "f.db")
	bad := []string{`CREATE TABLE ok (x INTEGER); CREATE TABLE ok (x INTEGER);`}
	if db, err := openDBWith(path, bad); err == nil {
		db.Close()
		t.Fatal("expected migration error")
	}
	db, err := sql.Open("sqlite", path)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	var n int
	db.QueryRow(`SELECT COUNT(*) FROM sqlite_master WHERE name='ok'`).Scan(&n)
	if n != 0 {
		t.Fatal("partial migration was not rolled back")
	}
}
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `go test ./... -run 'TestOpenDB|TestForeignKeys|TestReopen|TestMigration|TestFailedMigration'`
Expected: build failure, `undefined: openDB`.

- [ ] **Step 4: Implement `db.go`**

```go
package main

import (
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"errors"
	"fmt"
	"os"
	"strings"
	"time"

	_ "modernc.org/sqlite"
)

// ErrNotFound is wrapped by every lookup that finds no matching row.
var ErrNotFound = errors.New("not found")

// tsLayout matches JavaScript's Date.toISOString(), so the frontend and backend
// exchange timestamps without conversion. Always UTC.
const tsLayout = "2006-01-02T15:04:05.000Z"

// dateLayout is used for calendar dates (date applied, follow-up date), local time.
const dateLayout = "2006-01-02"

func ts(t time.Time) string { return t.UTC().Format(tsLayout) }

func newID() string {
	b := make([]byte, 8)
	if _, err := rand.Read(b); err != nil {
		return fmt.Sprintf("%x", time.Now().UnixNano())
	}
	return hex.EncodeToString(b)
}

type rowScanner interface {
	Scan(dest ...any) error
}

type execer interface {
	Exec(query string, args ...any) (sql.Result, error)
}

type querier interface {
	QueryRow(query string, args ...any) *sql.Row
}

func nullInt(p *int64) any {
	if p == nil {
		return nil
	}
	return *p
}

// expectOneRow turns "0 rows affected" into a wrapped ErrNotFound.
func expectOneRow(res sql.Result, err error, what, id string) error {
	if err != nil {
		return err
	}
	n, err := res.RowsAffected()
	if err != nil {
		return err
	}
	if n == 0 {
		return fmt.Errorf("%s %s: %w", what, id, ErrNotFound)
	}
	return nil
}

// Repo is the data layer. now is replaceable so tests can fix the clock.
type Repo struct {
	db       *sql.DB
	filesDir string
	now      func() time.Time
}

func NewRepo(db *sql.DB, filesDir string) *Repo {
	return &Repo{db: db, filesDir: filesDir, now: time.Now}
}

// migrations are applied in order; migration N is migrations[N-1]. Never edit
// a shipped migration — append a new one.
var migrations = []string{
	`CREATE TABLE jobs (
		id TEXT PRIMARY KEY,
		company TEXT NOT NULL,
		position TEXT NOT NULL,
		status TEXT NOT NULL,
		close_reason TEXT NOT NULL DEFAULT '',
		location TEXT NOT NULL DEFAULT '',
		work_mode TEXT NOT NULL DEFAULT '',
		salary_min INTEGER,
		salary_max INTEGER,
		salary_text TEXT NOT NULL DEFAULT '',
		url TEXT NOT NULL DEFAULT '',
		source TEXT NOT NULL DEFAULT 'manual',
		description TEXT NOT NULL DEFAULT '',
		date_posted TEXT NOT NULL DEFAULT '',
		date_applied TEXT NOT NULL DEFAULT '',
		follow_up_on TEXT NOT NULL DEFAULT '',
		notes TEXT NOT NULL DEFAULT '',
		created_at TEXT NOT NULL,
		updated_at TEXT NOT NULL
	);
	CREATE TABLE stage_events (
		id TEXT PRIMARY KEY,
		job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
		from_status TEXT,
		to_status TEXT NOT NULL,
		close_reason TEXT NOT NULL DEFAULT '',
		at TEXT NOT NULL,
		note TEXT NOT NULL DEFAULT ''
	);
	CREATE INDEX idx_stage_events_job ON stage_events(job_id, at);
	CREATE TABLE contacts (
		id TEXT PRIMARY KEY,
		job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
		name TEXT NOT NULL,
		role TEXT NOT NULL DEFAULT '',
		email TEXT NOT NULL DEFAULT '',
		phone TEXT NOT NULL DEFAULT '',
		linkedin_url TEXT NOT NULL DEFAULT '',
		notes TEXT NOT NULL DEFAULT ''
	);
	CREATE INDEX idx_contacts_job ON contacts(job_id);
	CREATE TABLE interviews (
		id TEXT PRIMARY KEY,
		job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
		kind TEXT NOT NULL,
		scheduled_at TEXT NOT NULL,
		duration_min INTEGER NOT NULL DEFAULT 0,
		location_or_link TEXT NOT NULL DEFAULT '',
		notes TEXT NOT NULL DEFAULT '',
		completed INTEGER NOT NULL DEFAULT 0
	);
	CREATE INDEX idx_interviews_job ON interviews(job_id);
	CREATE INDEX idx_interviews_scheduled ON interviews(scheduled_at);
	CREATE TABLE attachments (
		id TEXT PRIMARY KEY,
		job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
		label TEXT NOT NULL,
		file_name TEXT NOT NULL,
		stored_path TEXT NOT NULL,
		added_at TEXT NOT NULL
	);
	CREATE INDEX idx_attachments_job ON attachments(job_id);`,
}

func openDB(path string) (*sql.DB, error) {
	return openDBWith(path, migrations)
}

func openDBWith(path string, list []string) (*sql.DB, error) {
	db, err := sql.Open("sqlite", path+"?_pragma=foreign_keys(1)&_pragma=journal_mode(WAL)&_pragma=busy_timeout(5000)")
	if err != nil {
		return nil, err
	}
	// One connection: a desktop app has a single user, and it keeps
	// transactions and pragmas simple. Never query r.db while a tx is open.
	db.SetMaxOpenConns(1)
	if err := db.Ping(); err != nil {
		db.Close()
		return nil, fmt.Errorf("open database %s: %w", path, err)
	}
	if err := migrate(db, path, list); err != nil {
		db.Close()
		return nil, fmt.Errorf("migrate database %s: %w", path, err)
	}
	return db, nil
}

func schemaVersion(db *sql.DB) (int, error) {
	var v int
	err := db.QueryRow(`SELECT COALESCE(MAX(version), 0) FROM schema_version`).Scan(&v)
	return v, err
}

func migrate(db *sql.DB, path string, list []string) error {
	if _, err := db.Exec(`CREATE TABLE IF NOT EXISTS schema_version (version INTEGER NOT NULL)`); err != nil {
		return err
	}
	current, err := schemaVersion(db)
	if err != nil {
		return err
	}
	for i := current; i < len(list); i++ {
		n := i + 1
		if current > 0 {
			if err := backupDB(db, fmt.Sprintf("%s.bak-v%d", path, n)); err != nil {
				return fmt.Errorf("backup before migration %d: %w", n, err)
			}
		}
		if err := applyMigration(db, n, list[i]); err != nil {
			return err
		}
	}
	return nil
}

func applyMigration(db *sql.DB, n int, stmt string) error {
	tx, err := db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if _, err := tx.Exec(stmt); err != nil {
		return fmt.Errorf("migration %d: %w", n, err)
	}
	if _, err := tx.Exec(`DELETE FROM schema_version`); err != nil {
		return err
	}
	if _, err := tx.Exec(`INSERT INTO schema_version (version) VALUES (?)`, n); err != nil {
		return err
	}
	return tx.Commit()
}

// backupDB writes a consistent copy (including WAL contents) to dest.
func backupDB(db *sql.DB, dest string) error {
	if err := os.Remove(dest); err != nil && !errors.Is(err, os.ErrNotExist) {
		return err
	}
	_, err := db.Exec(`VACUUM INTO '` + strings.ReplaceAll(dest, "'", "''") + `'`)
	return err
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `go test ./... -run 'TestOpenDB|TestForeignKeys|TestReopen|TestMigration|TestFailedMigration' -v`
Expected: all 5 PASS.

- [ ] **Step 6: Commit**

```bash
git add db.go db_test.go testhelpers_test.go go.mod go.sum
git commit -m "feat: SQLite database with versioned migrations and backups

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Jobs and stage history

**Files:**
- Create: `jobs.go`, `jobs_test.go`

**Interfaces:**
- Consumes (Task 1): `Repo`, `newID`, `ts`, `tsLayout`, `dateLayout`, `ErrNotFound`, `rowScanner`, `execer`, `querier`, `nullInt`, `expectOneRow`, `newTestRepo`, `setNow`.
- Produces:
  - Status constants `StatusWishlist`, `StatusApplied`, `StatusInterviewing`, `StatusOffer`, `StatusClosed`.
  - `type Job struct` with JSON fields `id company position status closeReason location workMode salaryMin salaryMax salaryText url source description datePosted dateApplied followUpOn notes createdAt updatedAt`. Salaries are `*int64`; everything else is a string.
  - `type StageEvent struct{ ID, JobID, FromStatus, ToStatus, CloseReason, At, Note string }`. JSON: `id jobId fromStatus toStatus closeReason at note`. `FromStatus` is `""` for the creation event.
  - `(r *Repo) CreateJob(j Job) (Job, error)`
  - `(r *Repo) GetJob(id string) (Job, error)`
  - `(r *Repo) ListJobs() ([]Job, error)`
  - `(r *Repo) UpdateJob(j Job) (Job, error)`
  - `(r *Repo) UpdateJobNotes(id, notes string) error`
  - `(r *Repo) ChangeStatus(id, status, reason, note string) (Job, error)`
  - `(r *Repo) DeleteJob(id string) error`
  - `(r *Repo) ListStageEvents(jobID string) ([]StageEvent, error)`
  - `insertStageEvent(ex execer, jobID, from, to, reason, at, note string) error`
  - `getJob(q querier, id string) (Job, error)`
  - `isActive(status string) bool`

- [ ] **Step 1: Write the failing tests**

`jobs_test.go`:
```go
package main

import (
	"errors"
	"testing"
)

func mustCreate(t *testing.T, r *Repo, j Job) Job {
	t.Helper()
	created, err := r.CreateJob(j)
	if err != nil {
		t.Fatalf("CreateJob: %v", err)
	}
	return created
}

func TestCreateJobDefaultsAndCreationEvent(t *testing.T) {
	r := newTestRepo(t)
	j := mustCreate(t, r, Job{Company: "  Acme ", Position: "Dev"})
	if j.ID == "" || j.Status != StatusWishlist || j.Source != "manual" || j.Company != "Acme" {
		t.Fatalf("unexpected job: %+v", j)
	}
	if j.DateApplied != "" {
		t.Fatalf("wishlist job should have no date applied, got %q", j.DateApplied)
	}
	events, err := r.ListStageEvents(j.ID)
	if err != nil || len(events) != 1 || events[0].FromStatus != "" || events[0].ToStatus != StatusWishlist {
		t.Fatalf("events = %+v, %v", events, err)
	}
}

func TestCreateJobValidation(t *testing.T) {
	r := newTestRepo(t)
	five, four := int64(5), int64(4)
	cases := map[string]Job{
		"missing company":      {Position: "Dev"},
		"missing position":     {Company: "Acme"},
		"closed without reason": {Company: "Acme", Position: "Dev", Status: StatusClosed},
		"reason on open job":   {Company: "Acme", Position: "Dev", Status: StatusApplied, CloseReason: "rejected"},
		"bad status":           {Company: "Acme", Position: "Dev", Status: "hired"},
		"bad work mode":        {Company: "Acme", Position: "Dev", WorkMode: "moon"},
		"min above max":        {Company: "Acme", Position: "Dev", SalaryMin: &five, SalaryMax: &four},
		"bad date":             {Company: "Acme", Position: "Dev", FollowUpOn: "next week"},
	}
	for name, j := range cases {
		if _, err := r.CreateJob(j); err == nil {
			t.Errorf("%s: expected error", name)
		}
	}
}

func TestCreateAppliedJobSetsDateApplied(t *testing.T) {
	r := newTestRepo(t)
	j := mustCreate(t, r, Job{Company: "Acme", Position: "Dev", Status: StatusApplied})
	if j.DateApplied != "2026-10-01" {
		t.Fatalf("DateApplied = %q", j.DateApplied)
	}
}

func TestGetJobNotFound(t *testing.T) {
	r := newTestRepo(t)
	if _, err := r.GetJob("nope"); !errors.Is(err, ErrNotFound) {
		t.Fatalf("err = %v, want ErrNotFound", err)
	}
}

func TestUpdateJobKeepsStatusAndNotes(t *testing.T) {
	r := newTestRepo(t)
	j := mustCreate(t, r, Job{Company: "Acme", Position: "Dev", Notes: "original"})
	j.Position = "Senior Dev"
	j.Status = StatusOffer
	j.Notes = "stale copy"
	updated, err := r.UpdateJob(j)
	if err != nil {
		t.Fatal(err)
	}
	got, _ := r.GetJob(j.ID)
	if got.Position != "Senior Dev" || got.Status != StatusWishlist || got.Notes != "original" || updated.Status != StatusWishlist {
		t.Fatalf("got %+v", got)
	}
}

func TestUpdateJobNotes(t *testing.T) {
	r := newTestRepo(t)
	j := mustCreate(t, r, Job{Company: "Acme", Position: "Dev"})
	if err := r.UpdateJobNotes(j.ID, "# Prep\n- STAR stories"); err != nil {
		t.Fatal(err)
	}
	got, _ := r.GetJob(j.ID)
	if got.Notes != "# Prep\n- STAR stories" {
		t.Fatalf("notes = %q", got.Notes)
	}
	if err := r.UpdateJobNotes("nope", "x"); !errors.Is(err, ErrNotFound) {
		t.Fatalf("err = %v", err)
	}
}

func TestChangeStatusWritesEvents(t *testing.T) {
	r := newTestRepo(t)
	j := mustCreate(t, r, Job{Company: "Acme", Position: "Dev"})
	j, err := r.ChangeStatus(j.ID, StatusApplied, "", "")
	if err != nil || j.DateApplied != "2026-10-01" {
		t.Fatalf("apply: %+v %v", j, err)
	}
	j, err = r.ChangeStatus(j.ID, StatusClosed, "ghosted", "no reply in 3 weeks")
	if err != nil || j.CloseReason != "ghosted" {
		t.Fatalf("close: %+v %v", j, err)
	}
	events, _ := r.ListStageEvents(j.ID)
	if len(events) != 3 {
		t.Fatalf("want 3 events, got %+v", events)
	}
	last := events[2]
	if last.FromStatus != StatusApplied || last.ToStatus != StatusClosed || last.CloseReason != "ghosted" || last.Note != "no reply in 3 weeks" {
		t.Fatalf("last event = %+v", last)
	}
	j, err = r.ChangeStatus(j.ID, StatusApplied, "", "they wrote back")
	if err != nil || j.CloseReason != "" {
		t.Fatalf("reopen: %+v %v", j, err)
	}
}

func TestChangeStatusSameIsNoop(t *testing.T) {
	r := newTestRepo(t)
	j := mustCreate(t, r, Job{Company: "Acme", Position: "Dev", Status: StatusApplied})
	if _, err := r.ChangeStatus(j.ID, StatusApplied, "", ""); err != nil {
		t.Fatal(err)
	}
	events, _ := r.ListStageEvents(j.ID)
	if len(events) != 1 {
		t.Fatalf("same-status change wrote an event: %+v", events)
	}
}

func TestChangeStatusRequiresReasonForClosed(t *testing.T) {
	r := newTestRepo(t)
	j := mustCreate(t, r, Job{Company: "Acme", Position: "Dev"})
	if _, err := r.ChangeStatus(j.ID, StatusClosed, "", ""); err == nil {
		t.Fatal("expected error")
	}
	if _, err := r.ChangeStatus("nope", StatusApplied, "", ""); !errors.Is(err, ErrNotFound) {
		t.Fatalf("err = %v", err)
	}
}

func TestDeleteJobCascadesEvents(t *testing.T) {
	r := newTestRepo(t)
	j := mustCreate(t, r, Job{Company: "Acme", Position: "Dev"})
	if err := r.DeleteJob(j.ID); err != nil {
		t.Fatal(err)
	}
	var n int
	r.db.QueryRow(`SELECT COUNT(*) FROM stage_events WHERE job_id = ?`, j.ID).Scan(&n)
	if n != 0 {
		t.Fatalf("%d orphan events", n)
	}
	if err := r.DeleteJob(j.ID); !errors.Is(err, ErrNotFound) {
		t.Fatalf("second delete err = %v", err)
	}
}

func TestListJobsReturnsEmptySlice(t *testing.T) {
	r := newTestRepo(t)
	jobs, err := r.ListJobs()
	if err != nil || jobs == nil || len(jobs) != 0 {
		t.Fatalf("jobs = %#v, %v", jobs, err)
	}
}
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `go test ./... -run 'Job|ChangeStatus'`
Expected: build failure, `undefined: Job`.

- [ ] **Step 3: Implement `jobs.go`**

```go
package main

import (
	"database/sql"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"
)

const (
	StatusWishlist     = "wishlist"
	StatusApplied      = "applied"
	StatusInterviewing = "interviewing"
	StatusOffer        = "offer"
	StatusClosed       = "closed"
)

var validStatuses = map[string]bool{
	StatusWishlist: true, StatusApplied: true, StatusInterviewing: true, StatusOffer: true, StatusClosed: true,
}

var validCloseReasons = map[string]bool{"rejected": true, "withdrawn": true, "ghosted": true, "declined": true}

var validWorkModes = map[string]bool{"": true, "remote": true, "hybrid": true, "onsite": true}

type Job struct {
	ID          string `json:"id"`
	Company     string `json:"company"`
	Position    string `json:"position"`
	Status      string `json:"status"`
	CloseReason string `json:"closeReason"`
	Location    string `json:"location"`
	WorkMode    string `json:"workMode"`
	SalaryMin   *int64 `json:"salaryMin,omitempty"`
	SalaryMax   *int64 `json:"salaryMax,omitempty"`
	SalaryText  string `json:"salaryText"`
	URL         string `json:"url"`
	Source      string `json:"source"`
	Description string `json:"description"`
	DatePosted  string `json:"datePosted"`
	DateApplied string `json:"dateApplied"`
	FollowUpOn  string `json:"followUpOn"`
	Notes       string `json:"notes"`
	CreatedAt   string `json:"createdAt"`
	UpdatedAt   string `json:"updatedAt"`
}

type StageEvent struct {
	ID          string `json:"id"`
	JobID       string `json:"jobId"`
	FromStatus  string `json:"fromStatus"`
	ToStatus    string `json:"toStatus"`
	CloseReason string `json:"closeReason"`
	At          string `json:"at"`
	Note        string `json:"note"`
}

const jobColumns = `id, company, position, status, close_reason, location, work_mode, salary_min, salary_max, salary_text, url, source, description, date_posted, date_applied, follow_up_on, notes, created_at, updated_at`

func scanJob(s rowScanner) (Job, error) {
	var j Job
	var lo, hi sql.NullInt64
	err := s.Scan(&j.ID, &j.Company, &j.Position, &j.Status, &j.CloseReason, &j.Location, &j.WorkMode,
		&lo, &hi, &j.SalaryText, &j.URL, &j.Source, &j.Description, &j.DatePosted, &j.DateApplied,
		&j.FollowUpOn, &j.Notes, &j.CreatedAt, &j.UpdatedAt)
	if err != nil {
		return j, err
	}
	if lo.Valid {
		v := lo.Int64
		j.SalaryMin = &v
	}
	if hi.Valid {
		v := hi.Int64
		j.SalaryMax = &v
	}
	return j, nil
}

// isActive reports whether a job is in flight (applied but not yet closed).
func isActive(status string) bool {
	return status == StatusApplied || status == StatusInterviewing || status == StatusOffer
}

func validateJobFields(j *Job) error {
	j.Company = strings.TrimSpace(j.Company)
	j.Position = strings.TrimSpace(j.Position)
	if j.Company == "" {
		return errors.New("company is required")
	}
	if j.Position == "" {
		return errors.New("position is required")
	}
	if !validWorkModes[j.WorkMode] {
		return fmt.Errorf("invalid work mode %q", j.WorkMode)
	}
	if j.SalaryMin != nil && j.SalaryMax != nil && *j.SalaryMin > *j.SalaryMax {
		return errors.New("minimum salary is greater than maximum")
	}
	for _, d := range []string{j.DateApplied, j.FollowUpOn} {
		if d == "" {
			continue
		}
		if _, err := time.Parse(dateLayout, d); err != nil {
			return fmt.Errorf("invalid date %q (want YYYY-MM-DD)", d)
		}
	}
	if j.Source == "" {
		j.Source = "manual"
	}
	return nil
}

func validateStatus(status, reason string) error {
	if !validStatuses[status] {
		return fmt.Errorf("invalid status %q", status)
	}
	if status == StatusClosed && !validCloseReasons[reason] {
		return errors.New("closing a job needs a reason: rejected, withdrawn, ghosted or declined")
	}
	if status != StatusClosed && reason != "" {
		return errors.New("a close reason is only allowed for closed jobs")
	}
	return nil
}

func (r *Repo) today() string { return r.now().Format(dateLayout) }

func insertStageEvent(ex execer, jobID, from, to, reason, at, note string) error {
	var fromVal any
	if from != "" {
		fromVal = from
	}
	_, err := ex.Exec(`INSERT INTO stage_events (id, job_id, from_status, to_status, close_reason, at, note) VALUES (?, ?, ?, ?, ?, ?, ?)`,
		newID(), jobID, fromVal, to, reason, at, note)
	return err
}

func (r *Repo) CreateJob(j Job) (Job, error) {
	if j.Status == "" {
		j.Status = StatusWishlist
	}
	if err := validateJobFields(&j); err != nil {
		return Job{}, err
	}
	if err := validateStatus(j.Status, j.CloseReason); err != nil {
		return Job{}, err
	}
	if isActive(j.Status) && j.DateApplied == "" {
		j.DateApplied = r.today()
	}
	now := ts(r.now())
	j.ID, j.CreatedAt, j.UpdatedAt = newID(), now, now

	tx, err := r.db.Begin()
	if err != nil {
		return Job{}, err
	}
	defer tx.Rollback()
	_, err = tx.Exec(`INSERT INTO jobs (`+jobColumns+`) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		j.ID, j.Company, j.Position, j.Status, j.CloseReason, j.Location, j.WorkMode,
		nullInt(j.SalaryMin), nullInt(j.SalaryMax), j.SalaryText, j.URL, j.Source, j.Description,
		j.DatePosted, j.DateApplied, j.FollowUpOn, j.Notes, j.CreatedAt, j.UpdatedAt)
	if err != nil {
		return Job{}, err
	}
	if err := insertStageEvent(tx, j.ID, "", j.Status, j.CloseReason, now, ""); err != nil {
		return Job{}, err
	}
	return j, tx.Commit()
}

func getJob(q querier, id string) (Job, error) {
	j, err := scanJob(q.QueryRow(`SELECT `+jobColumns+` FROM jobs WHERE id = ?`, id))
	if errors.Is(err, sql.ErrNoRows) {
		return Job{}, fmt.Errorf("job %s: %w", id, ErrNotFound)
	}
	return j, err
}

func (r *Repo) GetJob(id string) (Job, error) { return getJob(r.db, id) }

func (r *Repo) ListJobs() ([]Job, error) {
	rows, err := r.db.Query(`SELECT ` + jobColumns + ` FROM jobs ORDER BY updated_at DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Job{}
	for rows.Next() {
		j, err := scanJob(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, j)
	}
	return out, rows.Err()
}

// UpdateJob saves the editable fields. Status changes go through ChangeStatus
// and notes through UpdateJobNotes, so neither can be overwritten here.
func (r *Repo) UpdateJob(j Job) (Job, error) {
	existing, err := r.GetJob(j.ID)
	if err != nil {
		return Job{}, err
	}
	if err := validateJobFields(&j); err != nil {
		return Job{}, err
	}
	j.Status, j.CloseReason, j.Notes, j.CreatedAt = existing.Status, existing.CloseReason, existing.Notes, existing.CreatedAt
	j.UpdatedAt = ts(r.now())
	_, err = r.db.Exec(`UPDATE jobs SET company = ?, position = ?, location = ?, work_mode = ?, salary_min = ?, salary_max = ?,
		salary_text = ?, url = ?, source = ?, description = ?, date_posted = ?, date_applied = ?, follow_up_on = ?, updated_at = ?
		WHERE id = ?`,
		j.Company, j.Position, j.Location, j.WorkMode, nullInt(j.SalaryMin), nullInt(j.SalaryMax),
		j.SalaryText, j.URL, j.Source, j.Description, j.DatePosted, j.DateApplied, j.FollowUpOn, j.UpdatedAt, j.ID)
	return j, err
}

func (r *Repo) UpdateJobNotes(id, notes string) error {
	res, err := r.db.Exec(`UPDATE jobs SET notes = ?, updated_at = ? WHERE id = ?`, notes, ts(r.now()), id)
	return expectOneRow(res, err, "job", id)
}

func (r *Repo) ChangeStatus(id, status, reason, note string) (Job, error) {
	if err := validateStatus(status, reason); err != nil {
		return Job{}, err
	}
	tx, err := r.db.Begin()
	if err != nil {
		return Job{}, err
	}
	defer tx.Rollback()
	j, err := getJob(tx, id)
	if err != nil {
		return Job{}, err
	}
	if j.Status == status && j.CloseReason == reason {
		return j, nil
	}
	from := j.Status
	j.Status, j.CloseReason = status, reason
	if isActive(status) && j.DateApplied == "" {
		j.DateApplied = r.today()
	}
	now := ts(r.now())
	j.UpdatedAt = now
	if _, err := tx.Exec(`UPDATE jobs SET status = ?, close_reason = ?, date_applied = ?, updated_at = ? WHERE id = ?`,
		j.Status, j.CloseReason, j.DateApplied, now, id); err != nil {
		return Job{}, err
	}
	if err := insertStageEvent(tx, id, from, status, reason, now, strings.TrimSpace(note)); err != nil {
		return Job{}, err
	}
	return j, tx.Commit()
}

func (r *Repo) DeleteJob(id string) error {
	res, err := r.db.Exec(`DELETE FROM jobs WHERE id = ?`, id)
	if err := expectOneRow(res, err, "job", id); err != nil {
		return err
	}
	// The id came from a real row, so it is a hex string, not a path.
	return os.RemoveAll(filepath.Join(r.filesDir, id))
}

func (r *Repo) ListStageEvents(jobID string) ([]StageEvent, error) {
	rows, err := r.db.Query(`SELECT id, job_id, from_status, to_status, close_reason, at, note
		FROM stage_events WHERE job_id = ? ORDER BY at, rowid`, jobID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []StageEvent{}
	for rows.Next() {
		var e StageEvent
		var from sql.NullString
		if err := rows.Scan(&e.ID, &e.JobID, &from, &e.ToStatus, &e.CloseReason, &e.At, &e.Note); err != nil {
			return nil, err
		}
		e.FromStatus = from.String
		out = append(out, e)
	}
	return out, rows.Err()
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `go test ./... -v -run 'Job|ChangeStatus'`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add jobs.go jobs_test.go
git commit -m "feat: job repository with automatic stage history

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Contacts, interviews and attachments

**Files:**
- Create: `contacts.go`, `interviews.go`, `attachments.go`, `contacts_test.go`, `interviews_test.go`, `attachments_test.go`

**Interfaces:**
- Consumes: `Repo`, `GetJob`, `DeleteJob`, `mustCreate` (test helper from `jobs_test.go`), `expectOneRow`, `newID`, `ts`, `rowScanner`.
- Produces:
  - `type Contact struct{ ID, JobID, Name, Role, Email, Phone, LinkedInURL, Notes string }`. JSON: `id jobId name role email phone linkedinUrl notes`.
  - `(r *Repo) ListContacts(jobID string) ([]Contact, error)`
  - `(r *Repo) SaveContact(c Contact) (Contact, error)`: inserts when `ID == ""`, otherwise updates.
  - `(r *Repo) DeleteContact(id string) error`
  - `type Interview struct{ ID, JobID, Kind, ScheduledAt string; DurationMin int; LocationOrLink, Notes string; Completed bool }`. JSON: `id jobId kind scheduledAt durationMin locationOrLink notes completed`.
  - `const interviewColumns`, `scanInterview(rowScanner) (Interview, error)`
  - `(r *Repo) ListInterviews(jobID string) ([]Interview, error)`
  - `(r *Repo) SaveInterview(iv Interview) (Interview, error)`
  - `(r *Repo) DeleteInterview(id string) error`
  - `type Attachment struct{ ID, JobID, Label, FileName, StoredPath, AddedAt string }`. JSON: `id jobId label fileName storedPath addedAt`.
  - `(r *Repo) AddAttachment(jobID, srcPath, label string) (Attachment, error)`
  - `(r *Repo) ListAttachments(jobID string) ([]Attachment, error)`
  - `(r *Repo) GetAttachment(id string) (Attachment, error)`
  - `(r *Repo) DeleteAttachment(id string) error`

- [ ] **Step 1: Write the failing tests**

`contacts_test.go`:
```go
package main

import (
	"errors"
	"testing"
)

func TestContactCRUD(t *testing.T) {
	r := newTestRepo(t)
	j := mustCreate(t, r, Job{Company: "Acme", Position: "Dev"})
	c, err := r.SaveContact(Contact{JobID: j.ID, Name: " Maya Lin ", Role: "Recruiter", Email: "maya@acme.test"})
	if err != nil || c.ID == "" || c.Name != "Maya Lin" {
		t.Fatalf("insert: %+v %v", c, err)
	}
	c.Role = "Senior Recruiter"
	if _, err := r.SaveContact(c); err != nil {
		t.Fatal(err)
	}
	list, _ := r.ListContacts(j.ID)
	if len(list) != 1 || list[0].Role != "Senior Recruiter" {
		t.Fatalf("list = %+v", list)
	}
	if err := r.DeleteContact(c.ID); err != nil {
		t.Fatal(err)
	}
	if list, _ := r.ListContacts(j.ID); list == nil || len(list) != 0 {
		t.Fatalf("after delete = %#v", list)
	}
}

func TestContactValidation(t *testing.T) {
	r := newTestRepo(t)
	j := mustCreate(t, r, Job{Company: "Acme", Position: "Dev"})
	if _, err := r.SaveContact(Contact{JobID: j.ID, Name: "  "}); err == nil {
		t.Fatal("expected name error")
	}
	if _, err := r.SaveContact(Contact{JobID: "nope", Name: "X"}); !errors.Is(err, ErrNotFound) {
		t.Fatalf("err = %v", err)
	}
	if _, err := r.SaveContact(Contact{ID: "nope", JobID: j.ID, Name: "X"}); !errors.Is(err, ErrNotFound) {
		t.Fatalf("update missing err = %v", err)
	}
}
```

`interviews_test.go`:
```go
package main

import (
	"testing"
	"time"
)

func TestInterviewCRUDAndOrdering(t *testing.T) {
	r := newTestRepo(t)
	j := mustCreate(t, r, Job{Company: "Acme", Position: "Dev"})
	later := time.Date(2026, 10, 9, 10, 0, 0, 0, time.Local).Format(time.RFC3339)
	sooner := time.Date(2026, 10, 2, 15, 0, 0, 0, time.Local).Format(time.RFC3339)

	a, err := r.SaveInterview(Interview{JobID: j.ID, Kind: "technical", ScheduledAt: later, DurationMin: 60})
	if err != nil {
		t.Fatal(err)
	}
	b, err := r.SaveInterview(Interview{JobID: j.ID, Kind: "phone_screen", ScheduledAt: sooner, DurationMin: 30})
	if err != nil {
		t.Fatal(err)
	}
	if b.ScheduledAt != ts(time.Date(2026, 10, 2, 15, 0, 0, 0, time.Local)) {
		t.Fatalf("scheduledAt not normalized: %q", b.ScheduledAt)
	}
	b.Completed = true
	if _, err := r.SaveInterview(b); err != nil {
		t.Fatal(err)
	}
	list, _ := r.ListInterviews(j.ID)
	if len(list) != 2 || list[0].ID != a.ID || !list[1].Completed {
		t.Fatalf("want upcoming first, completed last: %+v", list)
	}
	if err := r.DeleteInterview(a.ID); err != nil {
		t.Fatal(err)
	}
}

func TestInterviewValidation(t *testing.T) {
	r := newTestRepo(t)
	j := mustCreate(t, r, Job{Company: "Acme", Position: "Dev"})
	good := time.Date(2026, 10, 2, 15, 0, 0, 0, time.Local).Format(time.RFC3339)
	bad := []Interview{
		{JobID: j.ID, Kind: "coffee", ScheduledAt: good},
		{JobID: j.ID, Kind: "technical", ScheduledAt: "tomorrow"},
		{JobID: j.ID, Kind: "technical", ScheduledAt: good, DurationMin: -5},
		{JobID: "nope", Kind: "technical", ScheduledAt: good},
	}
	for i, iv := range bad {
		if _, err := r.SaveInterview(iv); err == nil {
			t.Errorf("case %d: expected error", i)
		}
	}
}
```

`attachments_test.go`:
```go
package main

import (
	"errors"
	"os"
	"path/filepath"
	"testing"
)

func writeTemp(t *testing.T, name, content string) string {
	t.Helper()
	dir := t.TempDir()
	p := filepath.Join(dir, name)
	if err := os.WriteFile(p, []byte(content), 0o644); err != nil {
		t.Fatal(err)
	}
	return p
}

func TestAttachmentDuplicateNamesWithSpaces(t *testing.T) {
	r := newTestRepo(t)
	j := mustCreate(t, r, Job{Company: "Acme", Position: "Dev"})
	first := writeTemp(t, "My Résumé v2.pdf", "one")
	second := writeTemp(t, "My Résumé v2.pdf", "two")

	a, err := r.AddAttachment(j.ID, first, "")
	if err != nil {
		t.Fatal(err)
	}
	b, err := r.AddAttachment(j.ID, second, "Tailored resume")
	if err != nil {
		t.Fatal(err)
	}
	if a.Label != "My Résumé v2.pdf" || b.Label != "Tailored resume" || a.StoredPath == b.StoredPath {
		t.Fatalf("a=%+v b=%+v", a, b)
	}
	for path, want := range map[string]string{a.StoredPath: "one", b.StoredPath: "two"} {
		got, err := os.ReadFile(path)
		if err != nil || string(got) != want {
			t.Fatalf("%s = %q, %v", path, got, err)
		}
	}
	list, _ := r.ListAttachments(j.ID)
	if len(list) != 2 {
		t.Fatalf("list = %+v", list)
	}
	if err := r.DeleteAttachment(a.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(a.StoredPath); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("file not removed: %v", err)
	}
}

func TestAttachmentToMissingJobLeavesNoFile(t *testing.T) {
	r := newTestRepo(t)
	src := writeTemp(t, "cv.pdf", "x")
	if _, err := r.AddAttachment("nope", src, ""); !errors.Is(err, ErrNotFound) {
		t.Fatalf("err = %v", err)
	}
	if _, err := os.Stat(filepath.Join(r.filesDir, "nope")); !errors.Is(err, os.ErrNotExist) {
		t.Fatal("directory created for missing job")
	}
}

func TestDeleteJobRemovesFiles(t *testing.T) {
	r := newTestRepo(t)
	j := mustCreate(t, r, Job{Company: "Acme", Position: "Dev"})
	a, err := r.AddAttachment(j.ID, writeTemp(t, "cv.pdf", "x"), "")
	if err != nil {
		t.Fatal(err)
	}
	if err := r.DeleteJob(j.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(a.StoredPath); !errors.Is(err, os.ErrNotExist) {
		t.Fatal("attachment survived job delete")
	}
}
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `go test ./... -run 'Contact|Interview|Attachment|DeleteJobRemovesFiles'`
Expected: build failure, `undefined: Contact`.

- [ ] **Step 3: Implement `contacts.go`**

```go
package main

import (
	"errors"
	"strings"
)

type Contact struct {
	ID          string `json:"id"`
	JobID       string `json:"jobId"`
	Name        string `json:"name"`
	Role        string `json:"role"`
	Email       string `json:"email"`
	Phone       string `json:"phone"`
	LinkedInURL string `json:"linkedinUrl"`
	Notes       string `json:"notes"`
}

func (r *Repo) ListContacts(jobID string) ([]Contact, error) {
	rows, err := r.db.Query(`SELECT id, job_id, name, role, email, phone, linkedin_url, notes
		FROM contacts WHERE job_id = ? ORDER BY name COLLATE NOCASE`, jobID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Contact{}
	for rows.Next() {
		var c Contact
		if err := rows.Scan(&c.ID, &c.JobID, &c.Name, &c.Role, &c.Email, &c.Phone, &c.LinkedInURL, &c.Notes); err != nil {
			return nil, err
		}
		out = append(out, c)
	}
	return out, rows.Err()
}

func (r *Repo) SaveContact(c Contact) (Contact, error) {
	c.Name = strings.TrimSpace(c.Name)
	if c.Name == "" {
		return c, errors.New("contact name is required")
	}
	if c.ID == "" {
		if _, err := r.GetJob(c.JobID); err != nil {
			return c, err
		}
		c.ID = newID()
		_, err := r.db.Exec(`INSERT INTO contacts (id, job_id, name, role, email, phone, linkedin_url, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
			c.ID, c.JobID, c.Name, c.Role, c.Email, c.Phone, c.LinkedInURL, c.Notes)
		return c, err
	}
	res, err := r.db.Exec(`UPDATE contacts SET name = ?, role = ?, email = ?, phone = ?, linkedin_url = ?, notes = ? WHERE id = ?`,
		c.Name, c.Role, c.Email, c.Phone, c.LinkedInURL, c.Notes, c.ID)
	return c, expectOneRow(res, err, "contact", c.ID)
}

func (r *Repo) DeleteContact(id string) error {
	res, err := r.db.Exec(`DELETE FROM contacts WHERE id = ?`, id)
	return expectOneRow(res, err, "contact", id)
}
```

- [ ] **Step 4: Implement `interviews.go`**

```go
package main

import (
	"errors"
	"fmt"
	"time"
)

var validInterviewKinds = map[string]bool{
	"phone_screen": true, "technical": true, "behavioral": true, "onsite": true, "panel": true, "other": true,
}

type Interview struct {
	ID             string `json:"id"`
	JobID          string `json:"jobId"`
	Kind           string `json:"kind"`
	ScheduledAt    string `json:"scheduledAt"`
	DurationMin    int    `json:"durationMin"`
	LocationOrLink string `json:"locationOrLink"`
	Notes          string `json:"notes"`
	Completed      bool   `json:"completed"`
}

const interviewColumns = `id, job_id, kind, scheduled_at, duration_min, location_or_link, notes, completed`

func scanInterview(s rowScanner) (Interview, error) {
	var iv Interview
	err := s.Scan(&iv.ID, &iv.JobID, &iv.Kind, &iv.ScheduledAt, &iv.DurationMin, &iv.LocationOrLink, &iv.Notes, &iv.Completed)
	return iv, err
}

// ListInterviews returns upcoming (not completed) interviews first, each group by time.
func (r *Repo) ListInterviews(jobID string) ([]Interview, error) {
	rows, err := r.db.Query(`SELECT `+interviewColumns+` FROM interviews WHERE job_id = ? ORDER BY completed, scheduled_at`, jobID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Interview{}
	for rows.Next() {
		iv, err := scanInterview(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, iv)
	}
	return out, rows.Err()
}

func (r *Repo) SaveInterview(iv Interview) (Interview, error) {
	if !validInterviewKinds[iv.Kind] {
		return iv, fmt.Errorf("invalid interview kind %q", iv.Kind)
	}
	at, err := time.Parse(time.RFC3339, iv.ScheduledAt)
	if err != nil {
		return iv, fmt.Errorf("invalid interview time %q", iv.ScheduledAt)
	}
	iv.ScheduledAt = ts(at)
	if iv.DurationMin < 0 {
		return iv, errors.New("duration can't be negative")
	}
	if iv.ID == "" {
		if _, err := r.GetJob(iv.JobID); err != nil {
			return iv, err
		}
		iv.ID = newID()
		_, err := r.db.Exec(`INSERT INTO interviews (`+interviewColumns+`) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
			iv.ID, iv.JobID, iv.Kind, iv.ScheduledAt, iv.DurationMin, iv.LocationOrLink, iv.Notes, iv.Completed)
		return iv, err
	}
	res, err := r.db.Exec(`UPDATE interviews SET kind = ?, scheduled_at = ?, duration_min = ?, location_or_link = ?, notes = ?, completed = ? WHERE id = ?`,
		iv.Kind, iv.ScheduledAt, iv.DurationMin, iv.LocationOrLink, iv.Notes, iv.Completed, iv.ID)
	return iv, expectOneRow(res, err, "interview", iv.ID)
}

func (r *Repo) DeleteInterview(id string) error {
	res, err := r.db.Exec(`DELETE FROM interviews WHERE id = ?`, id)
	return expectOneRow(res, err, "interview", id)
}
```

- [ ] **Step 5: Implement `attachments.go`**

```go
package main

import (
	"database/sql"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
)

type Attachment struct {
	ID         string `json:"id"`
	JobID      string `json:"jobId"`
	Label      string `json:"label"`
	FileName   string `json:"fileName"`
	StoredPath string `json:"storedPath"`
	AddedAt    string `json:"addedAt"`
}

const attachmentColumns = `id, job_id, label, file_name, stored_path, added_at`

func scanAttachment(s rowScanner) (Attachment, error) {
	var a Attachment
	err := s.Scan(&a.ID, &a.JobID, &a.Label, &a.FileName, &a.StoredPath, &a.AddedAt)
	return a, err
}

// AddAttachment copies srcPath into the job's files folder, so the exact file
// that was sent is preserved even if the original is later edited or deleted.
func (r *Repo) AddAttachment(jobID, srcPath, label string) (Attachment, error) {
	if _, err := r.GetJob(jobID); err != nil {
		return Attachment{}, err
	}
	a := Attachment{ID: newID(), JobID: jobID, FileName: filepath.Base(srcPath), AddedAt: ts(r.now())}
	a.Label = strings.TrimSpace(label)
	if a.Label == "" {
		a.Label = a.FileName
	}
	dir := filepath.Join(r.filesDir, jobID)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return Attachment{}, err
	}
	// The id prefix keeps two files with the same name apart.
	a.StoredPath = filepath.Join(dir, a.ID+"_"+a.FileName)
	if err := copyFile(srcPath, a.StoredPath); err != nil {
		return Attachment{}, fmt.Errorf("copy %s: %w", srcPath, err)
	}
	_, err := r.db.Exec(`INSERT INTO attachments (`+attachmentColumns+`) VALUES (?, ?, ?, ?, ?, ?)`,
		a.ID, a.JobID, a.Label, a.FileName, a.StoredPath, a.AddedAt)
	if err != nil {
		os.Remove(a.StoredPath)
		return Attachment{}, err
	}
	return a, nil
}

func copyFile(src, dst string) error {
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()
	out, err := os.Create(dst)
	if err != nil {
		return err
	}
	if _, err := io.Copy(out, in); err != nil {
		out.Close()
		os.Remove(dst)
		return err
	}
	if err := out.Close(); err != nil {
		os.Remove(dst)
		return err
	}
	return nil
}

func (r *Repo) ListAttachments(jobID string) ([]Attachment, error) {
	rows, err := r.db.Query(`SELECT `+attachmentColumns+` FROM attachments WHERE job_id = ? ORDER BY added_at, rowid`, jobID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Attachment{}
	for rows.Next() {
		a, err := scanAttachment(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, a)
	}
	return out, rows.Err()
}

func (r *Repo) GetAttachment(id string) (Attachment, error) {
	a, err := scanAttachment(r.db.QueryRow(`SELECT `+attachmentColumns+` FROM attachments WHERE id = ?`, id))
	if errors.Is(err, sql.ErrNoRows) {
		return Attachment{}, fmt.Errorf("attachment %s: %w", id, ErrNotFound)
	}
	return a, err
}

func (r *Repo) DeleteAttachment(id string) error {
	a, err := r.GetAttachment(id)
	if err != nil {
		return err
	}
	if _, err := r.db.Exec(`DELETE FROM attachments WHERE id = ?`, id); err != nil {
		return err
	}
	if err := os.Remove(a.StoredPath); err != nil && !errors.Is(err, os.ErrNotExist) {
		return err
	}
	return nil
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `go test ./... -v -run 'Contact|Interview|Attachment|DeleteJobRemovesFiles'`
Expected: all PASS.

- [ ] **Step 7: Commit**

```bash
git add contacts.go interviews.go attachments.go contacts_test.go interviews_test.go attachments_test.go
git commit -m "feat: contacts, interviews and file attachments per job

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Metrics and job summaries

**Files:**
- Create: `metrics.go`, `metrics_test.go`

**Interfaces:**
- Consumes: `Repo`, `ListJobs`, `Job`, `Interview`, `interviewColumns`, `scanInterview`, `isActive`, status constants, `ts`, `dateLayout`, `mustCreate`, `setNow`.
- Produces:
  - `type JobSummary struct{ Job Job; StageSince string; DaysInStage int; Stale bool; FollowUpDue bool; NextInterview *Interview }`. JSON: `job stageSince daysInStage stale followUpDue nextInterview`.
  - `type NextUp struct{ Interview Interview; Company, Position string }`. JSON: `interview company position`.
  - `type Metrics struct{ Active int; ResponseRate *float64; RespondedCount, AppliedCount, InterviewsThisWeek, FollowUpsDue int; NextUp *NextUp }`. JSON: `active responseRate respondedCount appliedCount interviewsThisWeek followUpsDue nextUp`. `ResponseRate` is a 0–1 fraction, or `nil` when nothing has been applied to.
  - `(r *Repo) ListJobSummaries(followUpDays int) ([]JobSummary, error)`
  - `(r *Repo) GetMetrics(followUpDays int) (Metrics, error)`
  - Pure helpers: `daysBetween(fromTS string, now time.Time) int`, `weekStart(t time.Time) time.Time`, `followUpDue(j Job, daysInStage int, today string, thresholdDays int) bool`

- [ ] **Step 1: Write the failing tests**

`metrics_test.go`:
```go
package main

import (
	"math"
	"testing"
	"time"
)

func TestDaysBetween(t *testing.T) {
	now := time.Date(2026, 10, 1, 9, 0, 0, 0, time.Local)
	cases := map[string]int{
		ts(time.Date(2026, 10, 1, 23, 0, 0, 0, time.Local)): 0,
		ts(time.Date(2026, 9, 30, 23, 59, 0, 0, time.Local)): 1,
		ts(time.Date(2026, 9, 1, 12, 0, 0, 0, time.Local)):   30,
		"garbage": 0,
	}
	for in, want := range cases {
		if got := daysBetween(in, now); got != want {
			t.Errorf("daysBetween(%s) = %d, want %d", in, got, want)
		}
	}
}

func TestWeekStart(t *testing.T) {
	monday := time.Date(2026, 9, 28, 0, 0, 0, 0, time.Local)
	for _, d := range []time.Time{
		time.Date(2026, 9, 28, 8, 0, 0, 0, time.Local),  // Monday
		time.Date(2026, 10, 1, 12, 0, 0, 0, time.Local), // Thursday
		time.Date(2026, 10, 4, 23, 0, 0, 0, time.Local), // Sunday
	} {
		if got := weekStart(d); !got.Equal(monday) {
			t.Errorf("weekStart(%v) = %v", d, got)
		}
	}
}

func TestFollowUpDueRules(t *testing.T) {
	today := "2026-10-01"
	cases := []struct {
		name string
		job  Job
		days int
		want bool
	}{
		{"applied and stale", Job{Status: StatusApplied}, 8, true},
		{"applied exactly at threshold", Job{Status: StatusApplied}, 7, false},
		{"interviewing and old", Job{Status: StatusInterviewing}, 30, false},
		{"follow-up date reached", Job{Status: StatusWishlist, FollowUpOn: "2026-10-01"}, 0, true},
		{"follow-up date in future", Job{Status: StatusOffer, FollowUpOn: "2026-10-02"}, 0, false},
		{"closed never due", Job{Status: StatusClosed, FollowUpOn: "2026-09-01"}, 40, false},
	}
	for _, c := range cases {
		if got := followUpDue(c.job, c.days, today, 7); got != c.want {
			t.Errorf("%s: got %v", c.name, got)
		}
	}
}

func TestGetMetricsEmpty(t *testing.T) {
	r := newTestRepo(t)
	m, err := r.GetMetrics(7)
	if err != nil {
		t.Fatal(err)
	}
	if m.ResponseRate != nil || m.Active != 0 || m.NextUp != nil {
		t.Fatalf("m = %+v", m)
	}
}

// seedPipeline builds: A applied→interviewing, B applied→closed(ghosted),
// C wishlist, D applied and untouched for 30 days, and an interview for A tomorrow.
func seedPipeline(t *testing.T, r *Repo) (a, b, c, d Job) {
	setNow(r, 2026, time.September, 1, 12)
	a = mustCreate(t, r, Job{Company: "Acme", Position: "Dev", Status: StatusApplied})
	b = mustCreate(t, r, Job{Company: "Brex", Position: "Dev", Status: StatusApplied})
	c = mustCreate(t, r, Job{Company: "Cora", Position: "Dev"})
	d = mustCreate(t, r, Job{Company: "Dune", Position: "Dev", Status: StatusApplied})
	setNow(r, 2026, time.September, 20, 12)
	if _, err := r.ChangeStatus(a.ID, StatusInterviewing, "", ""); err != nil {
		t.Fatal(err)
	}
	if _, err := r.ChangeStatus(b.ID, StatusClosed, "ghosted", ""); err != nil {
		t.Fatal(err)
	}
	setNow(r, 2026, time.October, 1, 12)
	tomorrow := time.Date(2026, 10, 2, 15, 0, 0, 0, time.Local).Format(time.RFC3339)
	if _, err := r.SaveInterview(Interview{JobID: a.ID, Kind: "technical", ScheduledAt: tomorrow, DurationMin: 60}); err != nil {
		t.Fatal(err)
	}
	return a, b, c, d
}

func TestGetMetrics(t *testing.T) {
	r := newTestRepo(t)
	seedPipeline(t, r)
	m, err := r.GetMetrics(7)
	if err != nil {
		t.Fatal(err)
	}
	if m.Active != 2 || m.AppliedCount != 3 || m.RespondedCount != 1 {
		t.Fatalf("m = %+v", m)
	}
	if m.ResponseRate == nil || math.Abs(*m.ResponseRate-1.0/3.0) > 1e-9 {
		t.Fatalf("rate = %v", m.ResponseRate)
	}
	if m.InterviewsThisWeek != 1 || m.FollowUpsDue != 1 {
		t.Fatalf("interviews=%d followUps=%d", m.InterviewsThisWeek, m.FollowUpsDue)
	}
	if m.NextUp == nil || m.NextUp.Company != "Acme" {
		t.Fatalf("nextUp = %+v", m.NextUp)
	}
}

func TestListJobSummaries(t *testing.T) {
	r := newTestRepo(t)
	a, _, c, d := seedPipeline(t, r)
	list, err := r.ListJobSummaries(7)
	if err != nil {
		t.Fatal(err)
	}
	byID := map[string]JobSummary{}
	for _, s := range list {
		byID[s.Job.ID] = s
	}
	if s := byID[d.ID]; s.DaysInStage != 30 || !s.Stale || !s.FollowUpDue {
		t.Errorf("D = %+v", s)
	}
	if s := byID[a.ID]; s.DaysInStage != 11 || s.NextInterview == nil || s.FollowUpDue {
		t.Errorf("A = %+v", s)
	}
	if s := byID[c.ID]; s.Stale || s.FollowUpDue {
		t.Errorf("wishlist job C should not be stale or due: %+v", s)
	}
}
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `go test ./... -run 'DaysBetween|WeekStart|FollowUp|Metrics|Summaries'`
Expected: build failure, `undefined: daysBetween`.

- [ ] **Step 3: Implement `metrics.go`**

```go
package main

import "time"

type JobSummary struct {
	Job           Job        `json:"job"`
	StageSince    string     `json:"stageSince"`
	DaysInStage   int        `json:"daysInStage"`
	Stale         bool       `json:"stale"`
	FollowUpDue   bool       `json:"followUpDue"`
	NextInterview *Interview `json:"nextInterview,omitempty"`
}

type NextUp struct {
	Interview Interview `json:"interview"`
	Company   string    `json:"company"`
	Position  string    `json:"position"`
}

type Metrics struct {
	Active             int      `json:"active"`
	ResponseRate       *float64 `json:"responseRate,omitempty"`
	RespondedCount     int      `json:"respondedCount"`
	AppliedCount       int      `json:"appliedCount"`
	InterviewsThisWeek int      `json:"interviewsThisWeek"`
	FollowUpsDue       int      `json:"followUpsDue"`
	NextUp             *NextUp  `json:"nextUp,omitempty"`
}

func dateOnly(t time.Time) time.Time {
	y, m, d := t.Date()
	return time.Date(y, m, d, 0, 0, 0, 0, t.Location())
}

// daysBetween counts calendar days (in now's time zone) from a stored timestamp to now.
func daysBetween(fromTS string, now time.Time) int {
	t, err := time.Parse(time.RFC3339, fromTS)
	if err != nil {
		return 0
	}
	hours := dateOnly(now).Sub(dateOnly(t.In(now.Location()))).Hours()
	days := int(hours/24 + 0.5) // rounding absorbs DST's 23/25-hour days
	if days < 0 {
		return 0
	}
	return days
}

// weekStart returns local midnight on the Monday of t's week.
func weekStart(t time.Time) time.Time {
	d := dateOnly(t)
	offset := (int(d.Weekday()) + 6) % 7
	return d.AddDate(0, 0, -offset)
}

func followUpDue(j Job, daysInStage int, today string, thresholdDays int) bool {
	if j.Status == StatusClosed {
		return false
	}
	if j.FollowUpOn != "" && j.FollowUpOn <= today {
		return true
	}
	return j.Status == StatusApplied && daysInStage > thresholdDays
}

func (r *Repo) latestStageTimes() (map[string]string, error) {
	rows, err := r.db.Query(`SELECT job_id, MAX(at) FROM stage_events GROUP BY job_id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[string]string{}
	for rows.Next() {
		var id, at string
		if err := rows.Scan(&id, &at); err != nil {
			return nil, err
		}
		out[id] = at
	}
	return out, rows.Err()
}

// nextInterviews maps each job to its soonest upcoming, not-completed interview.
func (r *Repo) nextInterviews(now time.Time) (map[string]Interview, error) {
	rows, err := r.db.Query(`SELECT `+interviewColumns+` FROM interviews WHERE completed = 0 AND scheduled_at >= ? ORDER BY scheduled_at`, ts(now))
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[string]Interview{}
	for rows.Next() {
		iv, err := scanInterview(rows)
		if err != nil {
			return nil, err
		}
		if _, seen := out[iv.JobID]; !seen {
			out[iv.JobID] = iv
		}
	}
	return out, rows.Err()
}

func (r *Repo) ListJobSummaries(followUpDays int) ([]JobSummary, error) {
	jobs, err := r.ListJobs()
	if err != nil {
		return nil, err
	}
	since, err := r.latestStageTimes()
	if err != nil {
		return nil, err
	}
	now := r.now()
	next, err := r.nextInterviews(now)
	if err != nil {
		return nil, err
	}
	today := now.Format(dateLayout)
	out := make([]JobSummary, 0, len(jobs))
	for _, j := range jobs {
		s := JobSummary{Job: j, StageSince: since[j.ID]}
		if s.StageSince == "" {
			s.StageSince = j.CreatedAt
		}
		s.DaysInStage = daysBetween(s.StageSince, now)
		s.Stale = isActive(j.Status) && s.DaysInStage > followUpDays
		s.FollowUpDue = followUpDue(j, s.DaysInStage, today, followUpDays)
		if iv, ok := next[j.ID]; ok {
			s.NextInterview = &iv
		}
		out = append(out, s)
	}
	return out, nil
}

func (r *Repo) GetMetrics(followUpDays int) (Metrics, error) {
	var m Metrics
	summaries, err := r.ListJobSummaries(followUpDays)
	if err != nil {
		return m, err
	}
	for _, s := range summaries {
		if isActive(s.Job.Status) {
			m.Active++
		}
		if s.FollowUpDue {
			m.FollowUpsDue++
		}
		if s.NextInterview != nil && s.Job.Status != StatusClosed &&
			(m.NextUp == nil || s.NextInterview.ScheduledAt < m.NextUp.Interview.ScheduledAt) {
			m.NextUp = &NextUp{Interview: *s.NextInterview, Company: s.Job.Company, Position: s.Job.Position}
		}
	}

	// Response rate: of jobs that ever reached applied-or-beyond, how many reached interviewing-or-beyond.
	err = r.db.QueryRow(`SELECT
		COUNT(DISTINCT CASE WHEN to_status IN ('applied', 'interviewing', 'offer') THEN job_id END),
		COUNT(DISTINCT CASE WHEN to_status IN ('interviewing', 'offer') THEN job_id END)
		FROM stage_events`).Scan(&m.AppliedCount, &m.RespondedCount)
	if err != nil {
		return m, err
	}
	if m.AppliedCount > 0 {
		rate := float64(m.RespondedCount) / float64(m.AppliedCount)
		m.ResponseRate = &rate
	}

	start := weekStart(r.now())
	err = r.db.QueryRow(`SELECT COUNT(*) FROM interviews i JOIN jobs j ON j.id = i.job_id
		WHERE i.completed = 0 AND j.status != 'closed' AND i.scheduled_at >= ? AND i.scheduled_at < ?`,
		ts(start), ts(start.AddDate(0, 0, 7))).Scan(&m.InterviewsThisWeek)
	return m, err
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `go test ./... -v -run 'DaysBetween|WeekStart|FollowUp|Metrics|Summaries'`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add metrics.go metrics_test.go
git commit -m "feat: pipeline metrics, days-in-stage and follow-up rules

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

> **Format note:** Tasks 1–4 above include full code. Tasks 5–16 are written as specs (files, signatures, behavior, tests), and the code is written during implementation. Every task still follows TDD for Go: write the listed tests, see them fail, implement, see them pass, then commit.

### Task 5: Legacy `data.json` import

**Files:** create `legacy_import.go`, `legacy_import_test.go`.

**Produces:** `(r *Repo) ImportLegacy(jsonPath string) (int, error)` and `mapLegacyStatus(s string) (status, reason string)`.

**Behavior:**
- **When nothing happens:** if the file is missing, return `0, nil`. If the `jobs` table already has rows, return `0, nil` and leave the file untouched.
- **Parsing:** the old shape is `{id, company, position, status, dateApplied, notes, updatedAt}`. Invalid JSON returns an error and the file is not renamed.
- **Single transaction:** each record is inserted directly, not via `CreateJob`, so the original timestamps are kept.
- **Status mapping:**
  - `Rejected` → `closed` + `rejected`.
  - `Wishlist`, `Applied`, `Interviewing` and `Offer` → lowercased.
  - Anything else → `wishlist`.
- **Field cleanup:** an empty company becomes `(unknown company)` and an empty position `(unknown position)`. An invalid `dateApplied` is dropped. `source` = `manual`.
- **Stage events:**
  - Normally one event, `null → status`, at `updatedAt` (or now if that is zero), with the note `imported`.
  - A Rejected record that has a `dateApplied` instead gets two: `null → applied` at that date, then `applied → closed/rejected` at `updatedAt`.
- **After commit:** rename the file to `data.json.bak`. A rename failure is only logged.

**Tests:**
- `TestImportLegacyBasic`: 3 records imported, statuses correct, a `.bak` exists and the original is gone.
- `TestImportLegacyMessyRecords` (Review Focus #4): an unknown status, an empty company and a bad date.
- `TestImportLegacyRejectedGetsAppliedEvent`.
- `TestImportLegacySkipsWhenJobsExist`.
- `TestImportLegacyInvalidJSONKeepsFile`.
- `TestImportLegacyMissingFile`.

### Task 6: Settings and window sizing logic

**Files:**
- Rewrite `settings.go`.
- Create `window.go` (pure functions only for now), `settings_test.go`, `window_test.go`.

**Settings:**
- **Struct** `Settings{AdzunaAppID, AdzunaAppKey, PythonPath string; FollowUpDays int; WindowWidth, WindowHeight int; WindowMaximised bool}`. JSON: `adzunaAppId adzunaAppKey pythonPath followUpDays windowWidth windowHeight windowMaximised`.
- `NewSettingsStore(dir string)` writes to `<dir>/settings.json`.
- **`Load`:** a missing file gives defaults. `FollowUpDays <= 0` becomes 7.
- **`Save`:**
  - `FollowUpDays <= 0` becomes 7; above 365 is an error.
  - Writes atomically (temp file, then rename) with permissions 0600.

**Window:**
- **`planWindow(screenW, screenH int, s Settings) windowPlan`**, where `windowPlan{Width, Height, MinWidth, MinHeight int; Maximise bool}`:
  - Min size is `min(900, screenW)` × `min(600, screenH)`.
  - If a saved size exists and fits on the screen, use it (raised to the minimum if needed) along with the saved maximised flag.
  - Otherwise use 85% of the screen, clamped between the minimum and 1600×1000. Maximise if `screenW <= 1280 || screenH <= 720`.
- **`pickScreen([]screenSize) (screenSize, bool)`:** prefer the current screen, then the primary, then the first. Ignore screens of zero size.

**Tests:**
- `TestSettingsDefaults`, `TestSettingsRoundTrip`, `TestSettingsRejectsHugeFollowUp`.
- `TestPlanWindow`, table-driven:
  - 1920×1080 → 1600×918, not maximised.
  - 2560×1440 → 1600×1000.
  - 1366×768 → 1161×652.
  - 1280×720 → maximised.
  - 800×600 → min 800×600, maximised.
  - A saved 1400×900 on 1920×1080 is restored.
  - A saved 2400×1300 on 1366×768 is ignored.
- `TestPickScreen`.

### Task 7: Discover backend

**Files:**
- Rewrite `scraper.py`.
- Create `discover.go`, `discover_test.go`, `proc_windows.go`, `proc_other.go`.

**`scraper.py`:**
- **Arguments:** `--site`, `--term`, `--location`, `--remote`, `--results` (default 20), `--self-test`.
- Imports jobspy inside a `try`; `--self-test` prints `{"jobs": []}` and exits.
- Calls `scrape_jobs(site_name=[site], …, is_remote, country_indeed="USA", linkedin_fetch_description=True)`.
- **Output fields per job:** `title, company, location, is_remote, min_amount, max_amount, interval, description, date_posted, job_url, site`.
  - NaN becomes `null` or `""`.
  - `is_remote` comes from `str(v).lower() == "true"`.
- **Output format:** exactly one line, `json.dumps(..., ensure_ascii=True)`. Any exception prints `{"error": "..."}`.

**`proc_windows.go`:**
- `hideConsole(cmd)` sets `CREATE_NO_WINDOW` and `HideWindow`.
- `openWithOS(path)` runs `rundll32 url.dll,FileProtocolHandler <path>`.
- `proc_other.go` holds no-op / `xdg-open` equivalents.

**`discover.go`:**
- **Types:**
  - `DiscoverQuery{Term, Location string; RemoteOnly bool; Sources []string}`
  - `DiscoverResult{Key, Title, Company, Location, WorkMode string; SalaryMin, SalaryMax *int64; SalaryText string; Annualized bool; Description, DatePosted, URL string; Sources []string; TrackedJobID, TrackedStatus string}`
  - `DiscoverResponse{Results []DiscoverResult; Errors map[string]string}`
  - Internal `rawJob`.
- **Embedding:** `//go:embed scraper.py` into `scraperScript`.
- **`resolvePython(override, exeDir, cwd string) (string, error)`:** checks the override, then `<exeDir>\venv\Scripts\python.exe`, then `<cwd>\venv\Scripts\python.exe`. The error message lists every path checked.
- **`runScraperScript(ctx, python, timeout, args...)`:**
  - Writes the embedded script to a `os.CreateTemp` file (deleted afterwards) and runs it with `exec.CommandContext` plus `hideConsole`, setting `PYTHONIOENCODING=utf-8`.
  - On timeout it returns `timed out after X`.
  - Parses the **last non-empty stdout line**. If that line is unreadable and the process failed, it reports the last line of stderr instead.
- **Script entry points:**
  - `runJobSpy(ctx, python, site, q)` runs the script with a 90s timeout.
  - `checkScraper(ctx, python)` runs `--self-test` with a 30s timeout.
- **`adzunaSearch(ctx, appID, appKey, q)`:**
  - Uses `adzunaBaseURL` (a var, so tests can override it) with a 20s timeout and `results_per_page=20`. `what` gets ` remote` appended when remote-only is set.
  - Maps the results to `rawJob` (interval `yearly`; date = first 10 characters of `created`).
  - Errors must **never contain the app key**: strip the `*url.Error` URL from them.
- **`normalizeSalary(min, max *float64, interval)`:**
  - Annualizes with the factors yearly 1, monthly 12, weekly 52, daily 260, hourly 2080. An unknown interval is treated as yearly.
  - Values `<= 0` count as missing.
  - Returns `(lo, hi *int64, annualized bool, text string)`. The text looks like `$45–$55/hr`, `From $5,000/mo` or `Up to $90,000/yr`.
- **Merging and matching:**
  - `dedupeKey(company, title)` lowercases, collapses whitespace and joins with `|`.
  - `mergeResults(lists...)` de-duplicates by key in first-seen order. It unions the sources, fills empty fields, keeps the longer description, and takes salary from a later duplicate if the first had none.
  - `markTracked(results, jobs)` matches by key or by non-empty URL.
- **`runDiscover(ctx, q, fetch sourceFunc, tracked []Job) DiscoverResponse`:**
  - Runs each known, de-duplicated source concurrently.
  - Collects per-source errors and drops results with empty titles.
  - Merges in the order the sources were requested, then calls `markTracked`.

**Tests:**
- `TestNormalizeSalary` (Review Focus #2).
- `TestParseScraperOutputUnicodeAndNoise` (Review Focus #1).
- `TestParseScraperOutputError`.
- `TestMergeResultsDedupes`.
- `TestMarkTracked`.
- `TestRunDiscoverPartialFailure`.
- `TestResolvePythonOrder`.
- `TestAdzunaSearchMapsFields` (uses httptest).
- `TestAdzunaErrorDoesNotLeakKey`.
- `TestScraperSelfTest`: skipped if there is no venv Python; otherwise it runs the real self-test.

### Task 8: Frontend tooling, theme and shell

**Files:**
- `frontend/package.json`, `tsconfig.json`, `tsconfig.node.json`, `vite.config.ts`, `index.html` (title "Job Track").
- `src/main.tsx`, `src/index.css`, `src/App.tsx`.
- `src/components/{AppShell,NavRail,TopBar,PageTitle}.tsx`.
- `src/lib/{backend,format,prefs}.ts`, `src/lib/format.test.ts`.
- Placeholder pages for Pipeline, Detail, Discover and Settings.
- Delete `App.css`, `style.css` and `src/assets/`.

**Steps:**
1. **Dependencies:** `npm install` react 18.3, react-router 7, @dnd-kit/core 6, react-markdown 9, lucide-react, @fontsource/plus-jakarta-sans, @fontsource/jetbrains-mono. Dev dependencies: vite 6, @vitejs/plugin-react 4, typescript 5, @types/react 18, @types/react-dom 18, tailwindcss 4, @tailwindcss/vite 4, vitest 3. Add the script `"test": "vitest run"`.
2. **Config:**
   - tsconfig `moduleResolution: "Bundler"`.
   - `vite.config.ts` uses `defineConfig` from `vitest/config` with plugins `react()` and `tailwindcss()`, and `test.include: ['src/**/*.test.ts']`.
3. **`index.css`:**
   - `@import "tailwindcss"`.
   - An `@theme` block with the Global Constraints color tokens and both fonts.
   - Body background: void color plus the two radial glows.
   - `@utility` classes `glass`, `field`, `btn`, `btn-primary`, `btn-ghost`, `btn-danger`, `label-mono`.
   - Dark scrollbars, dark `select option`, and `.markdown` prose styles.
   - Fonts are imported in `main.tsx`.
4. **Shell:**
   - `App.tsx` uses a HashRouter with `AppShell` as the layout route: `/` → Pipeline, `jobs/:id` → `JobDetailRoute` (remounts with `key={id}`), `discover`, `settings`.
   - `NavRail` is 64px wide, with labels showing at `min-[1100px]:` and a 224px width.
   - `TopBar` (search only for now) writes `?q=` on the Pipeline route.
5. **`lib/format.ts`:**
   - Constants and labels for statuses, close reasons (`Not selected`, `I withdrew`, `No response`, `I declined`), work modes, sources and interview kinds, plus `STATUS_DOT` classes.
   - Helpers: `formatMoney`, `formatSalary`, `initials`, `formatDate` (parses `YYYY-MM-DD` as a local date), `formatDateTime`, `daysLabel`, `percent`, `parseSalaryInput` (`120k`, `$120,000`), `toLocalInputValue`/`fromLocalInputValue`, `todayLocal`.
6. **Other lib files:**
   - `lib/prefs.ts`: `readPref`/`writePref` wrapped in try/catch.
   - `lib/backend.ts`: re-exports `../../wailsjs/go/main/App`, `main` from models, and `BrowserOpenURL`.
7. **Tests:** `format.test.ts` covers the salary cases (Review Focus #2: min only, max only, zeros, equal, decimals), initials, local date parsing, 12-hour time, `parseSalaryInput`, and the datetime-local round trip.

**Verify:** `npm test` and `npm run build` pass.

### Task 9: Backend wiring, window lifecycle, app plumbing

**Backend files:**
- Rewrite `app.go` and `main.go`; delete `store.go`.
- Add `domReady`/`beforeClose` to `window.go`.

**`App`:**
- `NewApp(dataDir)`:
  - Opens `jobtrack.db`, builds the `Repo`, and runs `ImportLegacy`.
  - Any failure is stored in `initErr`.
  - `dataDir` defaults to `~/.jobtrack`.
- **Bound methods**, each guarded by `ready()`:
  - Startup and jobs:
    - `GetStartupError() string`
    - `ListJobSummaries()` and `GetMetrics()`, which use `FollowUpDays` from settings
    - `GetJob`, `CreateJob`, `UpdateJob`, `UpdateJobNotes`, `ChangeStatus`, `DeleteJob`, `ListStageEvents`
  - Contacts and interviews:
    - `ListContacts`, `SaveContact`, `DeleteContact`
    - `ListInterviews`, `SaveInterview`, `DeleteInterview`
  - Files:
    - `ListAttachments`, `DeleteAttachment`, `OpenAttachment`
    - `PickAndAttachFile(jobID) (*Attachment, error)`: native dialog; returns nil when cancelled.
  - Discover: `Discover(q)` trims and requires a term, then calls `runDiscover` with a fetch function that uses `adzunaSearch` or `resolvePython` + `runJobSpy`.
  - Settings and data folder:
    - `GetSettings`
    - `SaveSettings`: keeps the window fields already on disk.
    - `TestPython(path) (string, error)`
    - `DataDir()` and `OpenDataDir()`
  - Lifecycle: `shutdown` closes the DB.

**Window lifecycle:**
- `main.go`:
  - Title "Job Track", 1024×640, `StartHidden: true`, background `#07090e`.
  - Hooks up `OnDomReady`, `OnBeforeClose` and `OnShutdown`.
- `domReady`:
  - Runs once.
  - Picks the screen, applies `planWindow` (min size, size, center, maximise), then shows the window.
  - Shows the window even if anything fails.
- `beforeClose` saves the size when the window isn't maximised or minimised, plus the maximised flag.

**Frontend plumbing:**
- Run `wails generate module`.
- **New lib files:**
  - `lib/api.ts`: `api()` returns `T | undefined` and shows a toast on error; `apiOk()` returns a boolean; `errorMessage()`.
  - `lib/toast.ts`: a `useSyncExternalStore` store; error toasts last 8s, others 3.5s.
  - `lib/events.ts`: `notifyDataChanged` / `useDataVersion`.
  - `lib/useLoad.ts`: `{data, loading, setData}`; reloads when deps change or the data version changes.
- **New components:** `Toaster`, `Modal` (Escape closes it, as does clicking the backdrop), `ConfirmDialog` (`confirmDialog()` returns a promise, plus `ConfirmHost`), `StartupErrorScreen`.
- `App.tsx` gates everything on `GetStartupError()`.

**Verify:**
- `go vet ./...`, `go test ./...`, `npm run build` and `wails build` all succeed.
- Launch the built exe once: the window fits the screen, and an existing `data.json` has been imported and renamed.

### Task 10: Pipeline board

**Files:**
- `components/{Chip,StatusChip,IconButton,JobForm,QuickAddModal,CloseReasonPicker,useStatusChange}.tsx`.
- `lib/{jobDraft,filter}.ts` with tests.
- `pages/Pipeline/{PipelinePage,MetricsRow,NextUpBanner,Board,JobCard}.tsx`.
- Final version of `TopBar` (summary chip + New Application button).

**Library code:**
- **`jobDraft.ts`:**
  - `JobDraft` holds string form fields; `emptyDraft`, `draftFromJob`.
  - `jobFromDraft(draft, base?)`: base keeps status, close reason, notes, description, source and timestamps.
  - `jobFromResult(result)`: wishlist status; source = the first source; empty company becomes `Unknown company`.
- **`filter.ts`:**
  - `filterSummaries(list, {query, workMode, source})` searches company, position and location.
  - `sortSummaries(list, key, dir)` sorts by company, position, status (pipeline order), salary (max, else min), date applied or days in stage.
- **`useStatusChange()`** returns `{request(job, status), picker}`:
  - Closed opens `CloseReasonPicker` (cancel = no change).
  - Every status change calls `ChangeStatus` and then `notifyDataChanged`.

**Board UI:**
- **Behavior:**
  - 5 droppable columns using dnd-kit, `PointerSensor` with a 6px distance, and a `DragOverlay`.
  - A drop on the card's own column, or outside any column, does nothing (Review Focus #3).
  - Non-closed moves update the UI optimistically via `main.JobSummary.createFrom`.
  - Clicks within 250ms of a drag ending are ignored; any other click opens the detail page.
- **Closed column:** collapsible (remembered in prefs), cards dimmed and tagged with their reason.
- **JobCard shows:** initials, company, position, salary chip, location/work mode, next interview, days in stage (amber when stale) and the follow-up flag.

**Other UI:**
- `MetricsRow`: 4 cards that show `—` when a value is unknown.
- `NextUpBanner`: only appears when an upcoming interview exists.
- `QuickAddModal`: `CreateJob`, then navigate to the new job's detail page.

**Tests:** `jobDraft.test.ts` and `filter.test.ts`.

**Verify:** `npm test`, `npm run build`, then `wails dev` and drag a card through every column.

### Task 11: Table view and filters

**Files:**
- `pages/Pipeline/{TableView,FilterBar}.tsx`.
- Update `PipelinePage`.

**Behavior:**
- The Board/Table toggle is remembered in prefs.
- Filters for work mode and source, a Clear button and an "N shown" count. They apply to both views.
- The table:
  - Sortable headers with arrows; the default sort is days in stage, descending.
  - Sticky header.
  - Clicking a row opens the job.
  - Closed rows are dimmed.

**Verify:** build passes; check both views at 900px wide.

### Task 12: Job detail page

**Files:**
- `pages/JobDetail/{JobDetailPage,JobHeader,EditJobModal,StageTimeline,DescriptionCard,NotesPad}.tsx`.
- `components/{Panel,Markdown}.tsx`.

**Behavior:**
- **Header:**
  - Back link, initials, title, company.
  - Chips for salary, location, work mode, source, applied date and follow-up date.
  - A status select that goes through `useStatusChange`.
  - An "Open posting" button (`BrowserOpenURL`), Edit (`JobForm` in edit mode → `UpdateJob`), and Delete (`confirmDialog` → `DeleteJob` → navigate home → notify).
- **Timeline:** built from `ListStageEvents`. The first event reads "Added to X". Each event shows its reason and note.
- **Description:** rendered as markdown, collapsed to about 14rem with a fade and an Expand toggle. Hidden when empty.
- **Notes pad:**
  - A markdown textarea with a preview toggle.
  - Autosaves 800ms after typing stops using a saved-text ref, so typing during a save is never lost.
  - Flushes any unsaved text on unmount.
  - Shows `Saved`, `Saving…`, `Unsaved` or `Save failed`.
- **Markdown component:** react-markdown, with links routed through `BrowserOpenURL`. Raw HTML is not rendered.
- **Layout:**
  - At 1200px and wider: three columns, `260px | 1fr | 340px`.
  - Below that: the timeline on the left (spanning 2 rows), the center column, and the right-hand panels underneath the center column.

**Verify:** build passes; edit, autosave, status change and delete all work in `wails dev`.

### Task 13: Contacts, interviews and files panels

**Files:** `pages/JobDetail/{ContactsPanel,ContactModal,InterviewsPanel,InterviewModal,FilesPanel}.tsx`; wire them into the right column.

**Behavior:**
- **Contacts:**
  - Add, edit and remove (with confirm).
  - Email has a copy-to-clipboard button (a toast confirms). LinkedIn opens via `BrowserOpenURL`.
- **Interviews:**
  - Kind, date and time (`datetime-local`, converted to an ISO string), duration, location or link, and notes.
  - Listed upcoming first. A toggle marks one complete, and completed ones are dimmed.
  - Links starting with `http` can be opened.
- **Files:** Attach uses `PickAndAttachFile` (cancel is a no-op), Open uses `OpenAttachment`, Remove asks for confirmation.

Every mutation calls `notifyDataChanged`, so the metrics and NextUp banner refresh.

**Verify:** add each type of item in `wails dev`; a scheduled interview appears on its card and in the NextUp banner.

### Task 14: Discover page

**Files:** `pages/Discover/{DiscoverPage,SearchForm,ResultsList,PreviewPane}.tsx`.

**Behavior:**
- **Search form:** term (required), location, remote-only, and checkboxes for Indeed, LinkedIn and ZipRecruiter. Adzuna is disabled with "(needs keys)" until its keys are set.
- **State:** a module-level cache keeps the query, results and selection when you navigate away and back.
- **Errors:** per-source errors show as a dismissible amber banner.
- **Results:**
  - Each one shows its salary, location, posted date and source chips.
  - Already-tracked jobs show "Tracking · Status".
- **Preview pane:**
  - Shows the full markdown description, the salary with "≈ annualized" plus the raw text, and the posting link.
  - Save to Wishlist uses `CreateJob(jobFromResult)`, then marks the result as tracked and notifies. A tracked result shows "Open tracked job" instead.
- **Responsive:**
  - Below 1100px the preview becomes a fixed slide-over with a close button.
  - Below 1100px the first result is not auto-selected.
- **Empty states:** one before the first search, another for no results.

**Verify:** a live search from `wails dev` returns results; saving one puts it on the board with its URL, salary and description.

### Task 15: Settings page

**Files:** `pages/Settings/SettingsPage.tsx`.

**Sections:**
- **Job sources:** Adzuna App ID and Key as password fields, plus a link to developer.adzuna.com.
- **Python:**
  - A path field with "Leave blank to auto-detect".
  - A Test button that calls `TestPython` and shows the resolved path in a toast.
- **Pipeline:** follow-up threshold, 1–365 days.
- **Data:** the read-only data folder path with an Open folder button.
- **Saving:** Save uses `SaveSettings`, then shows a toast and notifies.

**Verify:** the Test button succeeds with the venv, and a nonsense path still falls back to the venv. Changing the threshold changes the stale and follow-up flags.

### Task 16: Final verification and README

1. Run `go vet ./...`, `go test ./...`, `npm test` and `npm run build`; all must be clean.
2. `wails build`. Copy `build/bin/Job_Track.exe` to `%TEMP%\jt-test\`, set the Python path in Settings, and run a Discover search. It must work.
3. Manual pass:
   - Save a result, drag it through every stage to Closed, and check that the timeline, metrics and response rate update.
   - Add a contact, an interview and a file.
   - Restart the app; the window size is restored.
4. **Small-screen check:** test at a display setting of 1366×768, or 1920×1080 at 150% scaling. The window must be fully on-screen and every page usable.
5. Rewrite `README.md`: what the app is, features, setup (Go, Node, Wails, `python -m venv venv`, `pip install python-jobspy`), dev/build/test commands, and where data is stored.
6. Commit.
