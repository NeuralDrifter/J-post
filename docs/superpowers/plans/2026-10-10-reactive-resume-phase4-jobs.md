# Reactive Resume — Phase 4: Jobs Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Apply the `clean-code` skill to every file we author.

**Goal:** Resumes and letters become part of the job search: each job links the resume and letter sent (or a copy tailored for it), mock interviews read the linked resume, Discover can score a posting against any resume, and the pipeline exports to CSV and interviews to calendars.

**Spec:** `docs/superpowers/specs/2026-10-10-reactive-resume-integration-design.md` (Phases → 4)

## Global Constraints
- A score remembers its resume; it is outdated only when that resume (or the preferences) changed. Re-scoring keeps each posting on its resume.
- Tailored copy name: "<resume name> · <company>"; `source_id` = original, `job_id` = job.

## Tasks
1. Go: per-resume scores (`MatchScore.ResumeID`, `ScorePostingWith`, per-resume outdated and re-score) — tests first. **Done with this plan.**
2. Go: `Job.ResumeID/LetterID`, `LinkJobDocuments`, `TailorResumeForJob`; interviews and scorecards read the job's linked resume — tests first. **Done with this plan.**
3. Job detail: Documents panel (linked resume and letter with thumbnail; Change, Tailor for this job, Open, Export PDF, Unlink; "(in Trash)" with Restore).
4. Discover: posting right-click "Score with ▸" (resumes, default marked); the score breakdown names its resume.
5. Pipeline: Export CSV (table view); interviews to .ics (job detail interviews panel, one and all upcoming) using the vendored `ics.ts`.
6. Library: tailored copies show "Tailored · <Company> — <Position>" linking to the job.
7. Verify, README, commit.

## Rulings made while planning
- Reactive Resume's next-step hints are not ported: Job Track already shows days in stage, stale jobs, follow-up flags and a Next up banner; porting would duplicate them.
