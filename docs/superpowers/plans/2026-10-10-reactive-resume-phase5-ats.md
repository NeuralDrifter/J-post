# Reactive Resume — Phase 5: ATS Checker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Apply the `clean-code` skill to every file we author.

**Goal:** On a job's page, check how applicant tracking systems read the resume sent for it (rendered from the builder, or an attached PDF), against the job's description, and keep the latest report.

**Spec:** `docs/superpowers/specs/2026-10-10-reactive-resume-integration-design.md` (Phases → 5)

## Tasks
1. Go: migration 12 `ats_reports` (one per job, cascades with it), `SaveAtsReport`/`GetAtsReport`, `ReadAttachment` (25 MB cap) — tests first. **Done with this plan.**
2. Vendor upstream's `messages.ts` (finding wording) unchanged; `@lingui/core/macro` resolves to an English-only shim for vendored code; add `ts-pattern`.
3. `lib/resumes/atsCheck.ts`: sources (linked resume, default resume, attached PDFs), `runCheck(source, description)` → report saved with its source — the engine is imported lazily.
4. `AtsCheckPanel` on the job page: pick what to check, Run, and the report: score with its caps, category bars, findings by severity with what to do, job-description keyword coverage (matched/missing).
5. Verify, README, commit.
