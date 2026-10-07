# AI Providers — Claude Code (headless + temporary MCP) and Anthropic API — Design Spec

**Date:** 2026-10-07 · **Status:** Approved in chat, awaiting spec review · **Builds on:** Phase 2b-1 (mock interviews on Gemini Live)

## Goal

Interview grading and coaching tips can run on more than one AI provider, chosen in Settings, so the user can get sharper feedback from Claude and grade on their existing Claude subscription. An interview can be re-graded with a different provider and the scorecards compared side by side.

The work is a general **AI task layer**, not a grading-only feature: the planned AI review of job postings (ranking jobs against the resume, phase 2b-2) will plug in as another task with no redesign.

**Out of scope:** the live voice interview itself (only Gemini Live provides it, so it stays there); job ranking (a later spec); any provider beyond the three below.

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
2. Run `claude -p "<short prompt: call get_input, then submit_result once>"` with:
   - `--bare --strict-mcp-config --mcp-config <mcp.json>`: only our server; no user hooks, plugins or CLAUDE.md.
   - No built-in tools (the exact `--tools` form is confirmed in the risk-check task below), and `--allowedTools` limited to `mcp__jobtrack__get_input` and `mcp__jobtrack__submit_result`, so it never pauses for approval and can't touch files or run commands.
   - `--system-prompt <task instruction>`, `--no-session-persistence`, `--output-format json`, `--model` when set.
   - No console window (`hideConsole`), a timeout (5 minutes for grading, 60 s for tips), cancelled with the app's context.
3. Read the output file. Missing → error built from Claude Code's JSON result (`is_error`, `result`), e.g. "Claude Code isn't logged in".
4. Delete the temp folder.

**The MCP server is the Job Track executable itself.** `main.go` checks for `--ai-task-mcp <task.json>` before starting Wails; if present it serves MCP over stdin/stdout and exits when Claude Code closes the pipe. Built with the official Go MCP SDK. Tools:
- `get_input`: returns the task input text.
- `submit_result`: input schema = the task's result schema; validates, writes the JSON to the output path, replies "Saved."
- It never opens the database or any file other than `task.json` and the output path.

**First implementation task (risk check):** prove that the Wails GUI build on Windows works as a stdio MCP server when launched by `claude -p`, and confirm the exact flags that leave Claude Code with only our two tools. If it doesn't, fall back to a tiny separate `jobtrack-mcp.exe` built from the same package — decided before building on it.

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
- **Tips:** `NudgeAnswer` runs the `nudge` task on `tipsProvider`; failures stay silent in the UI (console warning), as now.

## 6. Review page

- More than one scorecard → tabs labelled with provider and model (e.g. "Gemini Live · Claude Code (Opus 5.5)"); otherwise the single card as now.
- A **Re-grade with…** menu lists every provider; unavailable ones are disabled with their reason.
- While a re-grade runs, the menu shows a spinner and the current cards stay visible.

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
- Before calling it done: one real run of each provider with the user's accounts on a copy of the database.
