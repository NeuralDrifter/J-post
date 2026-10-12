# Resume AI — Design Spec

**Date:** 2026-10-12 · **Status:** approved in conversation; the user waived the written-spec review

## Goal

The resume workshop (built on Reactive Resume, see `2026-10-10-reactive-resume-integration-design.md`) gains the AI features its "LLM phase" set aside, wired to Job Track's own AI providers (`internal/ai`):

1. **Tailor** a resume to a job.
2. **Improve** one line (stronger verb, add a result, shorter, custom).
3. **Writing review** in Check mode.
4. **Tidy an import** of a PDF or Word resume.
5. **Draft a cover letter** from the resume and the job.

And two non-AI clean-ups:

6. **ATS → builder:** every ATS finding links to the spot in the builder that fixes it.
7. **One source of resumes:** the Settings → Resume upload goes; every feature that needs a resume sends the user to the right place in the resume maker.

Settings changes shape to hold the extra tasks: AI providers (connections) and AI features (who does what, grouped and collapsible).

## Principles

- **Nothing changes silently.** Every AI result is a set of proposals the user accepts or rejects. Accepted changes are recorded in the document's history.
- **No invented facts.** Every prompt forbids inventing employers, titles, dates, tools or numbers; a figure the user must supply is a placeholder such as `[x]%`, highlighted until filled in. A proposal that adds a fact carries a "check this is accurate" flag.
- **Say what is sent.** Each feature states what it sends, to which provider, before the first run.
- **The app works without AI.** With no provider set up, AI entry points explain what is missing and link to Settings.
- **Pre-production:** no legacy migration. Old settings fields and the uploaded-resume table are removed, not converted.

## Out of scope

The assistant chat dock and agent threads; cancelling a run in flight (runs end on the provider timeout); branches in history; translations.

## Architecture

### AI tasks (Go)

Every AI feature is an `ai.Task` built in `internal/app` and run by `ai.RunTask`, as interview grading and match scores already are. Prompts are adapted from upstream's `packages/ai/src/prompts` (MIT) and kept in Go string constants next to their task, each with a strict JSON schema.

**Task registry.** `settings.AITasks` lists every AI task once: id, group, label, role, default provider. Settings, validation, defaults and the Settings UI all read it, so a new AI task is one entry.

| Group | Task id | Label |
|---|---|---|
| Mock interviews | `interviewPlan` | Question plan (before interviews) |
| Mock interviews | `interviewTips` | Coaching tips (during interviews) |
| Mock interviews | `interviewGrading` | Grading (scorecards) |
| Job matching | `jobMatch` | Discover match scores |
| Resumes | `resumeTailor` | Tailor to a job |
| Resumes | `resumeImprove` | Improve a line |
| Resumes | `resumeReview` | Writing review |
| Resumes | `resumeImport` | Tidy an import |
| Cover letters | `letterDraft` | Draft a letter |

**Settings model.** `Settings.AIFeatures map[string]AIChoice` (`json:"aiFeatures"`), where `AIChoice{Provider, Model, Effort string}`. Empty `Model` = the provider's model from AI providers; empty `Effort` = the task role's default. Replaces `GradingProvider`, `TipsProvider`, `PlanProvider`, `MatchProvider`, `AnthropicGradingEffort`, `AnthropicTipsEffort`. `ApplyDefaults` fills every registry task; `Save` rejects unknown tasks, providers and efforts.

**Per-run override.** `ai.RunTask(ctx, s, choice AIChoice, t Task, out)`: the choice's model is written into the copy of `s` for that provider's model field before the run, and its effort into the task. "Redo with ▸ provider / model" passes a one-off choice; Settings are untouched.

**Roles.** New `RoleWriting` (tailor, review, import, letter: up to 5 minutes, large output) and the existing `RoleTips` for Improve (fast, small output). Each provider's timeout and token tables gain `RoleWriting`.

### Proposals (frontend)

Built on the vendored `resume/proposals.ts` and `resume/patch.ts`.

- **Text proposal** — upstream's `Proposal`: replaces one passage (`<p>`/`<li>` block) of a rich-text field, or adds one after it; `before`, `after`, `why`; stale when the passage has changed since.
- **Patch proposal** (ours, `lib/resumes/aiProposals.ts`) — a structural change: a plain-words `description`, a `before`/`after` text rendering for the diff, and JSON Patch `ops` that start with `test` ops so a changed resume makes it stale. Applied with the vendored `applyResumePatches`.

The model never writes JSON pointers. It answers with a small vocabulary of typed edits referring to ids the frontend sent (passage ids, section ids, item ids), and `aiProposals.ts` compiles them into proposals:

| Edit | Used by | Becomes |
|---|---|---|
| `rewrite {passageId, text, why, addsFacts}` | all | text proposal |
| `addAfter {passageId, text, why, addsFacts}` | tailor, letter | text proposal (addition) |
| `setHeadline {text, why}` | tailor | patch |
| `orderSkills {itemIds[], why}` | tailor | patch |
| `addSkill {name, keywords[], why}` | tailor (only skills the resume already shows) | patch |
| `hideItem {sectionId, itemId, why}` | tailor | patch |
| `replaceSection {sectionId, section, why}` | import tidy | patch |
| `setBody {html, why}` | letter (empty body) | patch |

Edits that refer to unknown ids are dropped and counted in a note ("2 suggestions no longer fit and were left out").

### Generations (storage)

New table `ai_generations`:

```
id TEXT PRIMARY KEY, document_id TEXT REFERENCES documents(id) ON DELETE CASCADE,
task TEXT, section_key TEXT, job_id TEXT, provider TEXT, model TEXT,
proposals TEXT  -- JSON array, each with its status
created_at TEXT
```

One row per AI run per section (a whole-resume run writes one row per section it touched, sharing `created_at`). Regenerate adds a row with the same `section_key`. Bindings: `RunResumeAI(req) ([]AIGeneration, error)` runs a task and stores its rows; `ListAIGenerations(documentID)`; `SetAIGenerationProposals(id, proposalsJSON)` saves accept/reject state.

`RunResumeAI` takes `{task, documentId, sectionKey, jobId, posting, input, choice}`. `input` is the task's JSON material built by the frontend (passages, ids, extracted text). The Go side adds the job's description when `jobId` is set and returns the model's typed edits inside each row; the frontend compiles them.

### Review UI: Track Changes

- **Content panel:** a section with pending proposals shows them inline — removed words red strikethrough, added words green underline — from a word diff (`diff`/jsdiff, BSD-3; one new dependency, licenses regenerated). Each change has ✓/✗ and its why; a fact-adding change is flagged; placeholders are highlighted.
- **Section header:** `‹ 2 / 3 ›  <model> · <task> [for <job>]   Accept all · Reject all · Regenerate · Redo with ▸`. Version switching moves between that section's generations.
- **Right-click** (shared `ContextMenu`): on a change — Accept, Reject, Regenerate section, Redo with ▸; on a section or entry (content panel and page) — Tailor this section, Improve, Regenerate, Redo with ▸; on a rich-text line — Improve ▸ Stronger verb / Add a result / Make it shorter / Custom….
- **Page preview:** a margin marker on sections with pending changes; clicking it scrolls the content panel there.
- **Top bar:** "N changes to review" with previous/next.
- **Errors** stay in the section header with Retry and Redo with ▸, never a passing toast.

**Regenerate** re-runs one section, sending the texts already rejected or not chosen so the model writes something different.

### History: commits and diffs

- Each review action that accepts changes saves a version of kind `ai`, named like a commit message: "Tailored Summary, Experience · Acme Senior Engineer · claude-opus-5-5". `ai` versions never expire.
- The first accept of a generation is preceded by a `before-ai` version.
- History gains **Show changes**: a section-by-section word diff against the previous version or the current document, in the Track Changes colours.

## Features

### 1 · Improve a line (`resumeImprove`)

Right-click a line in any rich-text field (resume or letter) → Improve ▸, or the ✨ button in the field toolbar. Sends the line, its field's label and the field's text. One `rewrite` edit comes back as a text proposal on that line. Upstream's `improve-system.md` rules, including `addsFacts`.

### 2 · Tailor (`resumeTailor`)

A **Tailor** tab in the builder's right panel beside Design and Check. Source: a pipeline job (with a description) or a pasted posting. The job page's "Tailor a copy" makes the copy and opens the builder on this tab with that job chosen.

Input: passages (summary, every bullet and paragraph), the headline, skills with ids, item ids per section, the posting, and Job Match's found and missing terms. Edits: `rewrite`, `addAfter`, `setHeadline`, `orderSkills`, `addSkill`, `hideItem`. One run covers the resume; each section becomes its own generation so Regenerate works per section. Right-click a section → Tailor this section runs the task for that section only. The tab shows the Job Match score before and after accepted changes.

### 3 · Writing review (`resumeReview`)

A **Writing** tab in Check mode beside Issues and Job match. Shows what it sends, then reviews every passage for weak verbs, vague claims, missing results, repetition and length; returns `rewrite` edits whose why names the problem. Never part of the ATS score. Generations per section.

### 4 · Tidy an import (`resumeImport`)

After a PDF or DOCX import, the new resume keeps the extracted text in the builder's session and opens with a banner: "Imported from a PDF. Some parts may have landed in the wrong place. Tidy with AI". Input: the extracted text and the imported sections. Edits: `replaceSection` per section that the model would change, built with upstream's extraction template. Review in Track Changes. With no provider set up, the banner links to Settings.

### 5 · Draft a letter (`letterDraft`)

In the letter writer, **Draft with AI** (button and the body's right-click menu). Input: the linked job's description or a pasted posting, the sender's resume text, the job's notes, a tone (direct / warm / formal) and the letter's length target. An empty body gets `setBody`; a body with text gets `rewrite`/`addAfter` proposals. Recipient and sender fields are filled only when empty.

### 6 · ATS → builder

Each finding in the job page's ATS report and the standalone checker gets **Fix in builder** → `/resumes/:id?check=<finding key>`, which opens Check mode with that issue selected and its pin shown. Missing keywords → `/resumes/:id?check=match&job=<job id>`. A report on an attached PDF instead offers **Import this PDF to fix it**.

### 7 · One source of resumes

Removed: Settings → Resume (upload, text), the `profile` table, `UploadResume`, `UpdateResumeText`, `GetProfile`, `extractResumeText`, and `resumeTextFor`'s uploaded-text fallback. `DefaultResumeID`'s comment changes accordingly.

**Needs a resume.** Go returns errors wrapping `ErrNeedsResume` (message prefix `needs-resume:`) from every feature that requires a resume (match scores, Score with, ATS check of a job, tailoring, letter drafts). Mock interviews still run without one, with generic questions. The frontend's `NeedsResume` prompt picks the next step from the library state:

- resumes exist, no default → **Choose a default resume** (Resumes, default picker open);
- no resumes → **Create a resume** (new-resume dialog) or **Import one** (Import dialog);
- the job's chosen resume is in the Trash → **Restore it** or **Pick another** (the job's Resume & letter panel).

After the step, the user returns to where they started (`?return=` on the Resumes route).

## Settings

- **AI providers:** connections only — keys, servers, each provider's model, Test. The "who does what" selects leave this section.
- **AI features** (new section): one collapsible card per group. Collapsed: "3 tasks · Gemini Live, claude-opus-5-5" and a warning dot when a task's provider isn't set up (click → that provider). Expanded: per task, provider, model ("Provider default" or one of its models), and effort for Anthropic. "Use one provider for all" per group. Expansion state is remembered (localStorage).
- **Job matching** keeps its preferences; its provider moves to AI features.
- **Profile & resume** keeps the default-resume picker with Create / Import buttons; the upload section is gone.

## Testing

- Go: registry defaults and validation; `RunTask` override (model and effort reach the request); each task's prompt input and schema with the fake providers in `ai/aitest`; `ai_generations` repo; `ErrNeedsResume` cases; profile removal.
- Frontend (Vitest): edit compilation (`aiProposals.ts`) including stale and unknown-id cases; word diff rendering; generation switching and regenerate input; Settings task grouping and summaries; needs-resume step choice; ATS finding → builder link; version naming for `ai` and `before-ai`.
- `bash tools/verify.sh` green after every phase. No browser driving (verification from code and automated tests).

## Phases

Each phase is committed separately on `feature/resume-ai`.

| # | Phase | Delivers |
|---|---|---|
| 0a | Settings | Task registry, `AIFeatures`, `RunTask` override, `RoleWriting`, AI providers / AI features sections |
| 0b | One source of resumes | Profile removal, `ErrNeedsResume`, NeedsResume prompt and return routing |
| 0c | Proposal core | `ai_generations`, `RunResumeAI`, edit compiler, Track Changes UI, right-click, Redo with ▸, `ai`/`before-ai` versions, Show changes |
| 1 | Improve a line | |
| 2 | Tailor | |
| 3 | Writing review | |
| 4 | Tidy an import | |
| 5 | Letter draft | |
| 6 | ATS → builder | |
