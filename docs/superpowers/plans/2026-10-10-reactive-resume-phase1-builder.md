# Reactive Resume — Phase 1: Library and Builder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Apply the `clean-code` skill to every file we author. Steps use checkbox (`- [ ]`) syntax.

**Goal:** A Resumes page and a full resume builder (content, design, live PDF preview, PDF/JSON export) that look native to Job Track, with resumes stored in SQLite and a default resume that feeds the AI features.

**Architecture:** Go stores documents as opaque RR JSON plus derived plain text (`internal/app/resumes.go`) and serves cached web fonts through a Wails asset middleware (`internal/resumes`). The frontend wraps the vendored engine behind `lib/resumes/*` (render, text, editing model, store) and builds the screens from Job Track components. Pure UI-free logic from RR's web app (`features/resume/editor/write/model.ts`) is vendored rather than rewritten; screens are new.

**Tech Stack:** Go + SQLite (modernc), Wails v2 asset middleware, React 19, Forme (vendored `pdf/browser`), pdf.js, TipTap, CodeMirror, react-colorful, react-easy-crop, @dnd-kit/sortable, zustand + immer.

**Spec:** `docs/superpowers/specs/2026-10-10-reactive-resume-integration-design.md` (Phases → 1)

## Global Constraints

- Upstream commit `b3d8266`; vendored files keep the attribution header; local edits go in `tools/vendor_reactive_resume.patch` and `UPSTREAM.md`.
- Documents: `data` ≤ 5 MB, well-formed JSON; Go never parses its shape.
- Autosave 800 ms after the last change and on leaving; undo ≤ 100 steps; preview re-render 300 ms after a change.
- Photos: data URL, ≤ 512 px longest side, JPEG quality 0.9.
- Fonts: only URLs present in `fonts/webfontlist.json`; cached in `%USERPROFILE%\.jobtrack\fonts\` under a SHA-256 file name.
- Narrow layout breakpoint: 1100 px (same as the nav rail).
- AI resume text resolution order: given resume → default resume → uploaded profile text.

## Review Focus

- A document whose JSON no longer validates (older/newer schema, hand-edited) — opens read-only with JSON export, never overwritten (Task 6 test).
- Typing fast in the builder while a save is in flight — no lost edits, no out-of-order overwrite (Task 6 store test).
- Trashing the default resume — default cleared, AI falls back to uploaded text (Task 1 test).
- A font request for a URL not in the list, or with path tricks — 404, nothing written to disk (Task 2 test).
- Offline with no cached font — preview still renders with the fallback font (Forme's `missing` path; Task 5 manual check).

---

### Task 1: Documents in SQLite

**Files:** Modify `internal/app/db.go` (migration 11), `internal/settings/settings.go` (`DefaultResumeID`); Create `internal/app/resumes.go`, `internal/app/resumes_test.go`; Modify `internal/app/app.go` (bindings), the AI callers of `profile.ResumeText` (`app.go` match + interview paths).

**Produces:**
```go
type Document struct { ID, Kind, Name, Data, PlainText, SourceID, JobID, CreatedAt, UpdatedAt, DeletedAt string } // json camelCase
func (r *Repo) CreateDocument(kind, name, data, plainText string) (Document, error)
func (r *Repo) GetDocument(id string) (Document, error)
func (r *Repo) ListDocuments(kind string, trashed bool) ([]Document, error) // Data included: the library renders thumbnails
func (r *Repo) SaveDocument(id, data, plainText string) (Document, error)
func (r *Repo) RenameDocument(id, name string) error
func (r *Repo) DuplicateDocument(id string) (Document, error)
func (r *Repo) TrashDocument(id string) error
func (r *Repo) RestoreDocument(id string) error
func (r *Repo) DeleteDocumentForever(id string) error   // clears jobs.resume_id/letter_id
func (r *Repo) EmptyTrash(kind string) error
func (a *App) resumeTextFor(resumeID string) (string, error)
```
App bindings with the same names (`ListDocuments`, `CreateDocument`, …, `SetDefaultResume(id)`, `GetDefaultResumeID()`), plus `TrashDocument` clearing `DefaultResumeID` when it matches.

- [ ] Tests first (`resumes_test.go`): create/get round trip; list excludes trashed and vice versa, newest first; save updates `updated_at` and text; size cap error at 5 MB + 1; invalid JSON error; rename empty name error; duplicate gives "Copy of X" and new id; trash/restore; delete forever clears job links; empty trash only touches that kind; `resumeTextFor` order (explicit → default → profile, trashed default skipped).
- [ ] Implement; migration 11 per spec; `go test ./internal/app/` green; existing match/interview tests still green after switching them to `resumeTextFor("")`.
- [ ] `wails generate module`; commit.

### Task 2: Font cache

**Files:** Create `internal/resumes/fontcache.go`, `fontcache_test.go`; Modify `internal/app/run.go` (Middleware), `main.go` (embed `frontend/src/vendor/reactive-resume/fonts/webfontlist.json`, pass to `Run`); patch `pdf/forme/fonts.ts` so `load(src)` fetches `"/rr-fonts/" + encodeURIComponent(src)`.

**Produces:** `func NewFontCache(dir string, fontList []byte, client *http.Client) (*FontCache, error)`; `func (c *FontCache) Middleware(next http.Handler) http.Handler` handling `GET /rr-fonts/<escaped url>`.

- [ ] Tests first against `httptest.Server` (the list rewritten to its URL): listed URL → 200 with upstream bytes and a file on disk; second request served from disk with upstream stopped; unlisted URL → 404 and no upstream hit; `..`/encoded path tricks → 404; upstream 500 → 502 and nothing cached; non-GET → 405; other paths pass through to `next`.
- [ ] Implement (`textproc`/`httpapi` client conventions; atomic write via temp file + rename).
- [ ] Patch `fonts.ts`; regenerate `tools/vendor_reactive_resume.patch`; note in `UPSTREAM.md`; commit.

### Task 3: Vendor RR's editing model and template previews

**Files:** Modify `tools/vendor_reactive_resume.sh` (+ `web/` files list), Create `frontend/src/vendor/reactive-resume/web/resume/editor/write/model.ts` (and its test), `.../web/templates/*.jpg`; aliases for `@/features/...` imports if any.

- [ ] Script copies `apps/web/src/features/resume/editor/write/model.ts` (+ `model.test.ts` if present) and `apps/web/public/templates/jpg/*.jpg` into `web/`; headers added; idempotence re-checked.
- [ ] `UPSTREAM.md` lists them; vendored tests green; commit.

### Task 4: Engine wrappers (`frontend/src/lib/resumes/`)

**Produces:**
```ts
renderResumePdf(data: ResumeData): Promise<Blob>            // render.ts — the only importer of @reactive-resume/pdf/browser
resumePlainText(data: ResumeData): string                   // text.ts — buildMarkdown
newResumeData(kind: 'blank' | 'sample', name: string, template: Template): ResumeData   // factory.ts
parseStoredResume(json: string): { ok: true; data: ResumeData } | { ok: false; error: string }
loadPdf(blob: Blob): Promise<PDFDocumentProxy>; drawPage(doc, pageNumber, canvas, scale): Promise<void>; firstPageImage(blob, width): Promise<string>  // pdfjs.ts
```
- [ ] Tests (node): plain text contains name/headline/an experience company; sample factory sets name and template; parseStoredResume rejects bad JSON and schema-invalid data with a message; round trip `JSON.stringify(parse(x))` stable.
- [ ] Implement; commit.

### Task 5: Resumes library page

**Files:** Create `pages/Resumes/{ResumesPage,DocumentCard,NewResumeModal,TemplatePicker}.tsx`, `lib/resumes/library.ts` (filtering, sort, menu entries); Modify `App.tsx` (routes `/resumes`, `/resumes/:id`), `NavRail.tsx` (Resumes after Discover).

- [ ] Tests for `library.ts`: filter by name, default first then newest, tailored label.
- [ ] Page: tabs Resumes · Trash (Cover letters tab arrives in phase 2), cards with lazy first-page thumbnails, ★ default chip, context menu (Open, Rename, Duplicate, Set as default, Export ▸ PDF / JSON, Move to Trash; Trash: Restore, Delete forever), New modal (Blank / Sample → template grid → name), empty state.
- [ ] Commit.

### Task 6: Builder workspace

**Files:** Create `pages/ResumeBuilder/` — `ResumeBuilderPage.tsx` (route, load, repair view), `useResumeDocument.ts` (zustand store: data, history, save state, autosave), `TopBar.tsx`, `Canvas.tsx`, `content/*` (BasicsCard, PictureCard, SummaryCard, SectionCard, EntryModal, entry field sets, RichTextField, KeywordsField, DatesField), `design/*` (TemplatePanel, LayoutPanel, TypographyPanel, ColorsPanel, PagePanel, CustomCssPanel, NotesPanel), `useBuilderHotkeys.ts`.

- [ ] Store tests: edit → saved after debounce; edit during in-flight save → second save with latest data; undo/redo restores data and caps at 100; failed save → `error` state, data kept, retry saves.
- [ ] Content pane on RR's `model.ts` (outline rows, add/move/remove section, entries, drafts).
- [ ] Canvas: render on change (300 ms), keep last good render on failure with a warning banner, zoom fit/50–200 %, page navigation.
- [ ] Design pane panels; Custom CSS edits `metadata.stylesheet` via RR's compiler diagnostics.
- [ ] Narrow-window drawers; hotkeys (Ctrl+Z / Ctrl+Shift+Z / Ctrl+= / Ctrl+- / Ctrl+S).
- [ ] Commit per sub-area.

### Task 7: Settings → Resumes and docs

- [ ] Settings side-menu item **Resumes**: default resume picker (thumbnail + name, "None — use uploaded text").
- [ ] README: "Resumes" feature bullet. Spec deviations noted in the spec header.
- [ ] `bash tools/verify.sh`; visual pass in `wails dev` (wide + narrow) over every page incl. React 19 check deferred from phase 0; commit.
