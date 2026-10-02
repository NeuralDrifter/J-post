# Phase 2b-1 — Implementation Plan

> Compact plan (user preference). REQUIRED SUB-SKILL: superpowers:executing-plans. Go tasks are TDD.

**Spec:** `docs/superpowers/specs/2026-10-01-phase2b1-ai-foundation-mock-interview-design.md`

## Review Focus

1. **The interviewer's audio overlaps the next chunk, or the user interrupts it.** Expected: gapless back-to-back playback, and `interrupted` silences it immediately. Test: `reducer.test.ts` "interrupted clears playback".
2. **Speaker turns arrive as many small transcription fragments.** Expected: one line per turn, not one per fragment. Test: `reducer.test.ts` "fragments merge".
3. **The connection drops at about 10 minutes.** Expected: the session resumes with the stored handle; the transcript continues. Test: `reducer.test.ts` "goAway → reconnect".
4. **Gemini returns malformed JSON, or the call fails during scoring.** Expected: status `failed` with a retry, and the transcript is kept. Test: `TestScoreInterviewFailureKeepsTranscript`.
5. **No resume, or no key.** Expected: clear messages, no crash. Tests: `TestPrepareInterviewNoKey`, `TestBriefWithoutResume`.

### Task 1: Gemini client + AI settings

**Files:** `gemini.go` and `gemini_test.go`; `settings.go` (new fields and defaults).

**Produces:**
- `generateJSON(ctx, key, model, system string, parts []geminiPart, schema map[string]any, out any) error`
- `createLiveToken(ctx, key string, setup map[string]any, minutes int, now time.Time) (string, error)`
- Base URLs are vars so tests can point them at fake servers.

### Task 2: Resume (profile)

**Files:** migration 6 (profile + mock_interviews) in `db.go`; `profile.go` and `profile_test.go`.

**Produces:**
- `extractDocxText(path) (string, error)`
- `(r *Repo) SaveResume(fileName, storedPath, text) error`, `GetProfile() (Profile, error)`, `UpdateResumeText(text) error`
- App methods: `UploadResume() (*Profile, error)` (dialog, copy, extract; PDFs go through Gemini), `GetProfile`, `UpdateResumeText`.

### Task 3: Interview backend

**Files:** `interviews_ai.go` and `interviews_ai_test.go`.

**Produces:**
- `type MockInterview`, `type InterviewSetup`, `type TranscriptLine`, `type Scorecard`.
- `buildInterviewBrief(job, contacts, resumeText, setup) string`
- `liveSetup(model, voice, brief) map[string]any`
- Repo: `CreateMockInterview`, `GetMockInterview`, `ListMockInterviews(jobId)`, `SaveInterviewTranscript`, `SetInterviewRecording`, `SetInterviewResult`, `DeleteMockInterview` (also removes the file).
- App methods: `PrepareInterview`, `NudgeAnswer`, `ScoreInterview`, `SaveInterviewTranscript`, `SaveInterviewRecording(id, base64)`, `GetInterviewRecording(id) (dataURL string)`, `ListMockInterviews`, `GetMockInterview`, `DeleteMockInterview`.

### Task 4: Live client library (frontend)

**Files:** `lib/live/{audio.ts, metrics.ts, reducer.ts, session.ts, recorder-worklet.js}` with tests for audio, metrics and reducer.

### Task 5: UI

**Files:**
- Settings: an AI section (key, models, privacy note) and a Resume section (upload, view/edit text).
- `components/interview/InterviewSetupModal.tsx`; the job page button and right-click item.
- `pages/Interview/LiveInterviewPage.tsx` (`/interviews/:id/live`).
- `pages/Interview/InterviewReviewPage.tsx` (`/interviews/:id`).
- `pages/JobDetail/MockInterviewsPanel.tsx`.

### Task 6: Verify

Run `go vet`, `go test`, `npm test`, `npm run build` and `wails build`. Update the README. Hand off to the user for a live voice test.
