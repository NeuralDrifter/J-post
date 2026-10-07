# AI Providers — Claude Code (headless + temporary MCP) and Anthropic API — Design Spec

**Date:** 2026-10-07 · **Status:** Approved in chat, awaiting spec review · **Builds on:** Phase 2b-1 (mock interviews on Gemini Live)

## Goal

Interview grading and coaching tips can run on more than one AI provider, chosen in Settings, so the user can get sharper feedback from Claude and grade on their existing Claude subscription. An interview can be re-graded with a different provider and the scorecards compared side by side.

Everything from an interview is kept for later review, so the user can study their performance and improve: the two-sided recording and transcript (already saved), every grader's scorecard, and the coaching tips (new). An **Interviews** page lists them all, and each part can be deleted.

The work is a general **AI task layer**, not a grading-only feature: the planned AI review of job postings (ranking jobs against the resume, phase 2b-2) will plug in as another task with no redesign.

**Out of scope:** progress charts across interviews (a later idea); the live voice interview itself (only Gemini Live provides it, so it stays there); job ranking (a later spec); any provider beyond the three below.

## 1. Tasks and providers

**A task** is one AI job with a structured answer:
- `name` (`scorecard`, `nudge`; later `jobFit`)
- `instruction` (the system prompt)
- `input` (text: transcript, job description, resume, …)
- `schema`: the result's shape in **standard JSON Schema** (lowercase types, `required`, `additionalProperties: false`). Written once per task; every provider returns the same shape.

**A provider** runs any task: `runTask(ctx, settings, task) → JSON result`. Three providers, one file each:

| ID | Label | File | How it gets a structured result |
|---|---|---|---|
| `gemini-live` | Gemini Live | `provider_gemini.go` | Existing `liveStructured`: the `submit_result` tool call. Converts the JSON Schema to Gemini's types (OBJECT, STRING, …). |
| `anthropic` | Anthropic API | `provider_anthropic.go` | Official Anthropic Go SDK, Messages API with structured outputs (`output_config.format` = the schema). |
| `claude-code` | Claude Code | `provider_claudecode.go` | Headless `claude -p` with a temporary MCP server offering `get_input` and `submit_result` (section 3). |

`ListAIProviders()` (new binding) returns each provider's ID, label and readiness (`unavailable` reason, e.g. "Add your Anthropic API key in Settings"), following the Discover job-source pattern.

The existing scoring and tip code (`requestScorecard`, `nudgeAnswer`) becomes the `scorecard` and `nudge` task definitions plus a call through the chosen provider.

## 2. Settings

New fields in settings.json (0600):

| Field | Default | Notes |
|---|---|---|
| `gradingProvider` | `gemini-live` | Used automatically after each interview. |
| `tipsProvider` | `gemini-live` | Settings recommends Gemini Live: it answers in about a second; Claude Code takes several seconds to start. |
| `anthropicKey` | "" | |
| `anthropicModel` | `claude-opus-5-5` | Editable. |
| `anthropicGradingEffort` | `high` | `low`–`max`. |
| `anthropicTipsEffort` | `low` | |
| `claudeCodePath` | "" | Empty = find `claude` on PATH, then `~/.local/bin`. |
| `claudeCodeModel` | "" | Empty = the user's Claude plan default; otherwise passed as `--model`. |

The Settings page gets an **AI providers** section: the two provider choices, then a block per provider (Gemini key and Live model, as now; Anthropic key, model and efforts; Claude Code path, model and a "Test" button that runs `claude --version`).

## 3. Claude Code provider (headless, temporary MCP)

The MCP server exists **only for the one headless run**. It is never added to the user's Claude Code configuration (no `claude mcp add`, nothing written to their settings).

**Finding Claude Code:** `claudeCodePath` if set, else `claude` on PATH, else `~/.local/bin/claude(.exe)`. Not found → provider unavailable.

**One run:**
1. Create a temp folder holding:
   - `task.json`: instruction, input, schema, and the output file path.
   - `mcp.json`: `{"mcpServers": {"jobtrack": {"command": <this executable>, "args": ["--ai-task-mcp", <task.json>]}}}`.
2. Run `claude -p "<short prompt: call get_input, then submit_result once>"` from the temp folder as its working directory (so no project CLAUDE.md applies), with stdin closed, and these flags (confirmed against Claude Code 2.1.292):
   - `--setting-sources ""`: loads none of the user, project or local settings files, so none of the user's hooks or plugin settings run, and the user's CLAUDE.md is not loaded (verified).
   - `--strict-mcp-config --mcp-config <mcp.json>`: only our server.
   - `--tools ""` (all built-in tools disabled) and `--disable-slash-commands` (no skills).
   - `--allowedTools mcp__jobtrack__get_input mcp__jobtrack__submit_result`, so it never pauses for approval. Verified: the run sees exactly these two tools.
   - `--system-prompt <task instruction>`, `--no-session-persistence`, `--output-format json`, `--model` when set.
   - **Not `--bare`:** bare mode only accepts `ANTHROPIC_API_KEY` and never reads the OAuth login, so it would not use the user's Claude subscription.
   - No console window (`hideConsole`), a timeout (5 minutes for grading, 60 s for tips), cancelled with the app's context.
   - The model used comes from the JSON result's `modelUsage` keys.
3. Read the output file. Missing → error built from Claude Code's JSON result (`is_error`, `result`), e.g. "Claude Code isn't logged in".
4. Delete the temp folder.

**The MCP server is the Job Track executable itself.** `main.go` checks for `--ai-task-mcp <task.json>` before starting Wails; if present it serves MCP over stdin/stdout and exits when Claude Code closes the pipe. Built with the official Go MCP SDK. Tools:
- `get_input`: returns the task input text.
- `submit_result`: input schema = the task's result schema; validates, writes the JSON to the output path, replies "Saved."
- It never opens the database or any file other than `task.json` and the output path.

**Risk check (done, 2026-10-07):** the Wails GUI build on Windows works as a stdio MCP server when launched by `claude -p`: a real run called `get_input` then `submit_result`, wrote a schema-valid result, and reported `claude-opus-5-5`. No separate helper executable is needed.

## 4. Anthropic API provider

- Official Go SDK (`github.com/anthropics/anthropic-sdk-go`), Messages API.
- `system` = instruction, one user message = input, `output_config.format` = the task schema (structured outputs; forced tool choice is rejected on current models).
- `output_config.effort` from settings per role. Thinking is adaptive (the model default; not configurable on Opus 5.5).
- Server-side refusal fallback on by default (`fallbacks: "default"` with its beta header); check `stop_reason` before reading content, and report a refusal plainly.
- `max_tokens` 16000 for grading, 1024 for tips.
- Errors: 401 → "Anthropic rejected the API key"; 429 → rate limited, with the `retry-after` wait; 5xx/overloaded → "Anthropic is temporarily unavailable"; the key never appears in messages.

## 5. Scorecards per provider (migration 8)

New table:

| Column | |
|---|---|
| `id` | TEXT PRIMARY KEY |
| `mock_interview_id` | REFERENCES mock_interviews(id) ON DELETE CASCADE |
| `provider` | `gemini-live` / `anthropic` / `claude-code` |
| `model` | the exact model used ("" if the provider didn't report one) |
| `scorecard` | JSON |
| `created_at` | |

`UNIQUE(mock_interview_id, provider)`: re-grading with the same provider **replaces** its card; a new provider **adds** one.

Migration 8 copies every non-empty `mock_interviews.scorecard` into the table as provider `gemini-live`, then drops that column.

`MockInterview` gains `scorecards: [{provider, model, scorecard, createdAt}]` (newest first); `scorecard` stays as the latest card so job pages keep their average.

**Flows:**
- **After an interview:** `ScoreInterview(id)` uses `gradingProvider` — status `scoring` → `done`, or `failed` with the error (as today).
- **Re-grade:** `RegradeInterview(id, provider)`. On failure the interview keeps its status and cards; the error is returned for a toast. `failed` only applies while an interview has no scorecard.
- **Tips:** `NudgeAnswer(sessionId, question, answer, answerAtMs)` runs the `nudge` task on `tipsProvider` and **saves the tip** (section 5a) before returning it; failures stay silent in the UI (console warning), as now.

## 5a. Saved coaching tips (migration 8)

Today tips exist only on the live page and are lost when it closes. Migration 8 also adds:

| Column | |
|---|---|
| `id` | TEXT PRIMARY KEY |
| `mock_interview_id` | REFERENCES mock_interviews(id) ON DELETE CASCADE |
| `answer_at_ms` | when the answer the tip is about started (ties the tip to its transcript line) |
| `kind` | `tip` / `good` |
| `text` | |
| `provider`, `model` | who gave it |
| `created_at` | |

The backend saves each tip inside `NudgeAnswer`, so nothing depends on the page staying open. `MockInterview` gains `tips: [{answerAtMs, kind, text, provider, model}]`. The live page still shows the latest six; all tips are kept.

## 6. Review page

- **Recording** (already saved: your microphone and the interviewer mixed into one file): the audio player stays; clicking a transcript line still plays from that moment.
- **Coaching tips** appear inside the transcript, directly under the answer they were about (matched by `answerAtMs`), styled like the live coach panel (tip / praise).
- More than one scorecard → tabs labelled with provider and model (e.g. "Gemini Live · Claude Code (Opus 5.5)"); otherwise the single card as now.
- A **Re-grade with…** menu lists every provider; unavailable ones are disabled with their reason.
- While a re-grade runs, the menu shows a spinner and the current cards stay visible.
- **Deleting parts** (each asks for confirmation):
  - **Delete this scorecard** on each grader's tab: `DeleteScorecard(interviewId, provider)`. Deleting the last one returns the interview to "not scored", with a "Grade now" button.
  - **Delete recording**: `DeleteInterviewRecording(id)` removes the audio file and clears the path; transcript, tips and scorecards stay.
  - **Delete interview** (exists): removes everything, recording file included.

## 6a. Interviews page

A new **Interviews** item in the navigation rail (route `/interviews`), so past sessions are reachable without first opening the right job. The job page's Mock interviews panel stays as a shortcut.

- One row per mock interview across all jobs, newest first: date, job · company, interview type, length, interviewer name, latest overall score with a badge per grader that scored it, and icons when a recording or saved tips exist. Status shown for `scoring` / `failed` / not scored.
- Filter by job. Clicking a row opens the review page.
- Row context menu: Open, Delete interview (confirmation).
- Backed by `ListAllMockInterviews()`: summary rows (no transcript, tips or scorecard bodies), so the list stays fast as recordings pile up.

## 7. Errors

- Provider not set up → the reason from `ListAIProviders`, before any call.
- Claude Code: not found, not logged in, timed out, or finished without calling `submit_result` → readable messages.
- Anthropic: as in section 4.
- Gemini: unchanged.

## 8. Testing

- Each task's schema is valid JSON Schema; the Gemini conversion produces the expected types.
- Anthropic provider against an `httptest` server through the SDK's base-URL option: request shape (model, effort, `output_config.format`, headers), success, refusal, 401/429/5xx.
- Claude Code provider with a fake `claude` executable built by the test: command line flags, temp files created and removed, result read, error JSON surfaced.
- MCP server in-process through pipes: `get_input`, valid `submit_result` written, invalid result rejected.
- Migration 8 on a database with existing scorecards; per-provider replace/add; re-grade failure keeps status and cards.
- Tips: `NudgeAnswer` saves the tip with provider, model and `answerAtMs`; tips cascade with their interview; a failed tip call saves nothing.
- Deletes: `DeleteScorecard` (last one → not scored), `DeleteInterviewRecording` (file removed, other data kept), whole-interview delete still removes the file.
- `ListAllMockInterviews` returns summaries across jobs, newest first, with grader badges and recording/tip flags.
- Before calling it done: one real run of each provider with the user's accounts on a copy of the database.
