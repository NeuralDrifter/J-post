# Reactive Resume — Phase 2: Cover Letters and DOCX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Apply the `clean-code` skill to every file we author.

**Goal:** Cover letters as their own documents (library tab, writer with live page, design shared with resumes) and Word export for resumes and letters.

**Architecture:** A letter is stored in `documents` (kind `letter`) as Reactive Resume's `CoverLetterDocument` JSON. It renders by composing it into a one-section resume (`composeCoverLetter` + `createCoverLetterResumeData`, vendored) with `includeCoverLetterHeader`. The builder's preview and design sections are decoupled from the resume store so the letter writer reuses them. DOCX comes from the vendored `buildDocx`.

**Spec:** `docs/superpowers/specs/2026-10-10-reactive-resume-integration-design.md` (Phases → 2)

## Global Constraints

- English letter wording (Job Track is English-only): "Dear {name},", "Dear hiring team,", "Hiring team", "Kind regards,", dates as "October 10, 2026".
- New letters start `layout: 'structured'`; freeform letters (imported) keep their recipient block as written.
- Letters copy sender details and design from a resume when created (`copyCoverLetterStyle`), then are independent.
- Exports: PDF strict (as resumes), DOCX, JSON (the `CoverLetterDocument`).

## Review Focus

- A letter whose JSON fails the schema — read-only view with raw export (as resumes).
- Trash with both resumes and letters — restore/delete act on the right kind; Empty Trash clears both.
- Changing a letter's template or type must not touch the resume it was copied from.
- DOCX of a resume with a photo and rich text — opens (zip with word/document.xml).
- Thumbnails of letters render the letter, not an empty resume.

---

### Task 1: Decouple preview and design from the resume store
- `PreviewCanvas({ zoom, data, renderOptions })`; render requests carry `renderOptions` through the worker.
- `design/designContext.ts`: `DesignContext` providing `{ metadata, updateMetadata(recipe) }`; Template/Typography/Colors/Page/CustomCss sections use it; the resume builder provides it from `data.metadata`.
- `createEditorStore<T>(initial, save, normalize?)` generic; resume passes `syncResumeDates`.
- `BuilderTopBar` takes editor controls and export items as props (`useEditorControls(store)`).
- Existing tests stay green; resume builder unchanged to the eye.

### Task 2: Letter document model (`lib/resumes/letter.ts`) — tests first
- `newLetterData(source: ResumeData | null): LetterData`, `parseStoredLetter(json)`, `serializeLetter`, `letterPageData(letter)`, `letterPlainText(letter)`, `LETTER_WORDS`.
- Tests: structured composition (greeting from name, team greeting, sign-off with sender), date wording, plain text contains body and recipient, parse rejects bad JSON/schema, new letter copies sender and design but not notes/layout.

### Task 3: Library — Cover letters tab and Trash for both kinds
- Tabs Resumes · Cover letters · Trash; New letter modal (name, copy sender and design from a resume — default preselected — or blank, template).
- Trash lists both kinds with a kind label; Empty Trash empties both; thumbnails render letters.

### Task 4: Letter writer (`/letters/:id`)
- Left: To (name, company), date, body (TipTap), Freeform switch with recipient block; Sender card (basics fields shared with resumes).
- Centre: `PreviewCanvas` with the composed letter. Right: design sections via `DesignContext` on `style.metadata`.
- Autosave/undo via the generic store; repair view on invalid data.

### Task 5: DOCX export
- `exportResumeDocx`, `exportLetterDocx` via vendored `buildDocx`; Export menus (library and builders) gain "Word (.docx)".
- Test (node): `buildDocx(sample)` → Blob whose zip contains `word/document.xml`.

### Task 6: Verify, README, commit
