# Resume AI — Phases 0c–6 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The proposal core (runs stored per document, Track Changes review, AI commits in History) and the five AI features plus ATS → builder links.

**Architecture:** Go runs every resume AI task through one binding, `RunResumeAI`, which stores the model's typed edits as an `ai_generations` row. The frontend compiles those edits against the current resume into tracked changes (text proposals from the vendored `resume/proposals.ts`, or JSON-patch changes), shows them per section with a word diff, and on accept applies them as one undo step and commits `before-ai` / `ai` versions.

**Tech Stack:** Go 1.23, SQLite, Wails v2, React 19, zustand, immer, fast-json-patch (vendored `resume/patch.ts`), `diff` (jsdiff) for word diffs, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-12-resume-ai-design.md`

## Global Constraints

- Nothing changes silently: every model edit is a change the user accepts or rejects.
- Prompts forbid invented employers, titles, dates, tools or numbers; placeholders like `[x]%` are highlighted; `addsFacts` flags changes to check.
- The model never writes JSON pointers; it answers with typed edits that name ids the builder sent.
- Every AI entry point says what it sends before the first run (a one-line "Sends … to <provider>").
- Python edits write `newline='\n'`; files stay LF.
- `bash tools/verify.sh` green before each phase's commit; one commit per phase.

## Review Focus

- Edits naming a passage, item or section that no longer exists (resume edited while the model ran): dropped and counted, never applied elsewhere. Test in Task 0c-3.
- Accepting a change whose passage was edited since: shown stale, accept disabled. Test in Task 0c-3.
- A model answer that isn't the expected JSON: the section shows the provider's error with Retry; nothing is stored. Test in Task 0c-1.
- A locked document: AI runs refuse with the lock message; review buttons are read-only. Test in Task 0c-1.
- Undo after accepting: the change shows pending again (vendored `getStateIn` semantics) and the decision is cleared on the next save of decisions. Test in Task 0c-3.

---

## Phase 0c — Proposal core

### Task 0c-1: Generations table and RunResumeAI (Go)

**Files:** Create `internal/app/ai_generations.go`, `internal/app/resume_ai.go`, tests; modify `internal/app/db.go` (migration 17), `internal/app/document_versions.go` (kinds `ai`, `before-ai`, `CommitAIVersion`), `internal/app/app_documents.go` (bindings).

**Interfaces — Produces:**
```go
type AIGeneration struct {
    ID, DocumentID, Task, SectionKey, JobID, Posting, Provider, Model string
    Edits     string // the model's answer: {"edits":[...]} as JSON
    Decisions string // JSON object: change key → "accepted" | "rejected"
    CreatedAt string
}
type ResumeAIRequest struct {
    Task, DocumentID, SectionKey, JobID, Posting string
    Input           string // the task's material as JSON, built by the builder
    Provider, Model string // one-run override; "" = the task's setting
}
func (a *App) RunResumeAI(req ResumeAIRequest) (AIGeneration, error)
func (a *App) ListAIGenerations(documentID string) ([]AIGeneration, error) // oldest first
func (a *App) SetAIGenerationDecisions(id, decisions string) error
func (a *App) CommitAIVersion(documentID, kind, name, data, plainText string) (DocumentVersion, error)
var resumeAITasks map[string]resumeAITask // task id → instruction, schema, role
```
- Tests: unknown task; locked document; job posting fills `Posting` from the job's description; override provider/model reaches the run (fake Anthropic); bad answer → error and no row; decisions must be a JSON object; `CommitAIVersion` rejects other kinds; generations cascade-delete with the document.

### Task 0c-2: Word diff and commit messages (frontend, pure)

**Files:** `frontend/src/lib/resumes/ai/diff.ts`, `commitMessage.ts` + tests; `npm i diff`.
```ts
export type DiffPart = { kind: 'same' | 'added' | 'removed'; text: string }
export function wordDiff(before: string, after: string): DiffPart[]
export function commitMessage(c: { task: string; sections: string[]; job?: string; model: string }): string
```

### Task 0c-3: Edit compiler (frontend, pure)

**Files:** `frontend/src/lib/resumes/ai/edits.ts`, `changes.ts` + tests.
```ts
export type Edit =
  | { kind: 'rewrite'; passageId: string; text: string; why: string; addsFacts?: boolean }
  | { kind: 'addAfter'; passageId: string; text: string; why: string; addsFacts?: boolean }
  | { kind: 'setHeadline'; text: string; why: string }
  | { kind: 'orderSkills'; itemIds: string[]; why: string }
  | { kind: 'addSkill'; name: string; keywords: string[]; why: string }
  | { kind: 'hideItem'; sectionId: string; itemId: string; why: string }
  | { kind: 'replaceSection'; sectionId: string; items: Record<string, unknown>[]; why: string }
  | { kind: 'setBody'; html: string; why: string }
export type ChangeStatus = 'pending' | 'accepted' | 'rejected' | 'stale'
export type Change = { key: string; generationId: string; sectionId: string; location: string; before: string; after: string;
  why: string; addsFacts: boolean; status: ChangeStatus; apply: (draft: ResumeData) => boolean }
export function resumePassages(data: ResumeData): Passage[]
export function compileGeneration(data: ResumeData, gen: AIGeneration): { changes: Change[]; dropped: number }
```

### Task 0c-4: Review store and Track Changes UI

**Files:** `frontend/src/pages/ResumeBuilder/ai/{reviewStore.ts,SectionChanges.tsx,ChangeRow.tsx,DiffText.tsx,redoMenu.ts,ReviewBar.tsx,accept.ts}` + tests for the store's pure parts; modify `SectionCard.tsx`, `ResumeCanvas.tsx` (page marks via `markProposals`-style marking of pending text changes), `BuilderTopBar`/`ResumeBuilderPage.tsx` (review bar), History panel (`ai`/`before-ai` titles, Show changes diff).

## Phase 1 — Improve a line
Go task `resumeImprove` (RoleTips) with upstream's improve rules; RichTextField context menu Improve ▸ and toolbar ✨; one `rewrite` edit; works in letters (LETTER_SECTION_ID).

## Phase 2 — Tailor
Go task `resumeTailor` (RoleWriting); Tailor tab in the right panel (job or pasted posting; what is sent; run; per-section results with match score before/after); section menu "Tailor this section"; job page "Tailor a copy" opens `/resumes/:id?panel=tailor&job=<id>`.

## Phase 3 — Writing review
Go task `resumeReview` (upstream's ats-review rules, rewrite-only output as `rewrite` edits plus notes); Check → Writing tab.

## Phase 4 — Tidy an import
Go task `resumeImport`; import keeps the extracted text in session storage keyed by document id; builder banner; `replaceSection` edits per section, validated with the vendored zod section schemas.

## Phase 5 — Letter draft
Go task `letterDraft` (upstream's letter-draft rules); Draft with AI in the letter writer; `setBody` on empty body, else `rewrite`/`addAfter`; tone and length.

## Phase 6 — ATS → builder
`?check=<finding key>` and `?check=match&job=<id>` on `/resumes/:id`; Fix in builder on report findings; Import this PDF for attachment sources.
