# Reactive Resume — Phase 3: Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Apply the `clean-code` skill to every file we author.

**Goal:** Import resumes and letters from JSON Resume, Reactive Resume v4/v5 JSON, a LinkedIn data export, PDF and Word files, without AI and without anything leaving the computer except photo downloads.

**Architecture:** `lib/resumes/importFile.ts` detects a file's kind from its bytes and shape (modelled on upstream's `read-file.ts`) and dispatches to the vendored importers. PDFs are read with the vendored `extract-client.ts` (pdf.js) → `documentToLines` → `parseResumeText`; Word files are read in the browser (`word/document.xml` paragraphs) → `parseResumeText`. Remote photo URLs are fetched through a Go binding with an SSRF guard and stored as data URLs. Letters embedded in older resumes are split out into letters.

**Spec:** `docs/superpowers/specs/2026-10-10-reactive-resume-integration-design.md` (Phases → 3; Data → Pictures)

## Global Constraints

- Picture fetch: http/https only; refuses loopback, private, link-local and unspecified addresses at dial time; 5 MB cap; image content types only; 20 s timeout.
- Legacy `.doc` is refused with "save it as .docx first"; scanned PDFs (no text layer) get a clear message.
- Nothing is created until the person confirms the import summary.

## Review Focus

- A JSON file that is none of the formats — "not a resume this app can read", nothing created.
- A resume JSON whose photo URL points at a private address — photo dropped, import still succeeds, toast says why.
- A huge or password-protected PDF — upstream's messages (`PdfTooLargeError`, `PdfPasswordRequiredError`).
- A Reactive Resume export with cover letters inside — the resume plus one letter per embedded letter.
- An account-archive zip — told to extract it first.

---

### Task 1: Vendor the PDF extractor
- Add `features/ats-checker/extract-client.ts` to the vendor script's web files; tests green.

### Task 2: Picture fetch (Go) — tests first
- `internal/resumes/picture.go`: `FetchPicture(ctx, url) (dataURL string, err error)` with a dialer that rejects non-public IPs; `App.FetchPicture` binding.
- Tests: image served → data URL with its type; non-image → error; too large → error; non-http scheme → error; loopback refused by the guard (test server allowed only through an injected test dialer).

### Task 3: File reading (`lib/resumes/importFile.ts`) — tests first
- `detectImportKind(name, bytes)`, `readImport(name, bytes): Promise<ImportResult>` where `ImportResult = { kind: 'resume'; data; letters: LetterData[] } | { kind: 'letter'; letter }`, `docxText(bytes)`, `summarizeImport(data)`.
- Tests: kind detection (pdf magic, zip+.zip → linkedin, zip+.docx → docx, .doc refused, account archive refused, JSON Resume / RR v4 / RR v5 / cover letter by shape); JSON Resume → name and experience; RR v5 with embedded letter → resume without it plus one letter; docxText paragraphs; unknown JSON → error.

### Task 4: Import dialog and photos
- Library "Import" button (both tabs) → modal: pick a file → summary (sections, entries, dates to check, letters) → name → create; remote photo URL fetched through Go first.
- Settings' uploaded-resume section points to Import.

### Task 5: Verify, README, commit
