# AI Providers + Interview Review Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let interview grading and coaching tips run on Gemini Live, the Anthropic API, or headless Claude Code (with a per-run MCP server), keep every grader's scorecard and every tip, and give past interviews an Interviews page with per-part deletes.

**Architecture:** A small AI task layer: a task is an instruction + input + JSON Schema; three providers implement `run(task)`. Claude Code is launched headless with a temporary MCP config whose server is the Job Track executable itself (`--ai-task-mcp`). Scorecards and tips move to their own tables (migration 8); the frontend gains a providers section in Settings, tabs/re-grade/deletes on the review page, and an Interviews page.

**Tech Stack:** Go 1.26 (Wails v2, modernc SQLite), official Anthropic Go SDK (`github.com/anthropics/anthropic-sdk-go`), official Go MCP SDK (`github.com/modelcontextprotocol/go-sdk`), React + TypeScript (vitest), Claude Code CLI 2.1.x.

**Spec:** `docs/superpowers/specs/2026-10-07-ai-providers-design.md`

**Plan style (user preference):** tasks list files, interfaces and tests; test sketches are given, full implementations are not. Write the code to satisfy the interfaces and tests.

## Global Constraints

- Provider IDs, exactly: `gemini-live`, `anthropic`, `claude-code`. Labels: "Gemini Live", "Anthropic API", "Claude Code".
- Defaults: `gradingProvider` = `gemini-live`, `tipsProvider` = `gemini-live`, `anthropicModel` = `claude-opus-5-5`, `anthropicGradingEffort` = `high`, `anthropicTipsEffort` = `low`; efforts allowed: `low`, `medium`, `high`, `xhigh`, `max`.
- Gemini stays on the Live model only (`liveStructured`); no Gemini text/TTS model calls.
- The MCP server exists only for one headless run: never `claude mcp add`, never write to the user's Claude Code settings; temp folder deleted after every run (success or failure).
- Claude Code runs from the temp folder with stdin closed and `--setting-sources "" --strict-mcp-config --mcp-config <mcp.json> --tools "" --disable-slash-commands --allowedTools mcp__jobtrack__get_input mcp__jobtrack__submit_result --system-prompt <instruction> --no-session-persistence --output-format json` (+ `--model` when set); **never `--bare`** (it disables the OAuth login, so the user's subscription wouldn't be used); no console window; timeout 5 min (grading) / 60 s (tips). (Confirmed in Task 1's risk check.)
- Anthropic: structured outputs (`output_config.format`), never forced `tool_choice`; thinking left unset (adaptive); refusal fallback `fallbacks: "default"` with beta `server-side-fallback-2026-07-01`; `max_tokens` 16000 grading / 1024 tips; API key never in errors.
- One JSON Schema per task, standard form (lowercase types, `required`, `additionalProperties: false`); Gemini gets a converted copy.
- Migrations are append-only: add migration 8; never edit 1–7.
- Every task ends with `go vet ./...`, `go test ./...` and, when frontend files changed, `npx tsc --noEmit -p .` and `npx vitest run` in `frontend/` all passing. After a Go binding change run `wails generate module` and delete the stray `jobtrack.exe` it leaves.
- No AI attribution trailers in commits; AI help is credited by model name on the licenses page (`BUILT_WITH`) and in the README Credits.

## Review Focus

1. **Claude Code installed but not logged in (or subscription lapsed):** `claude -p` exits with an error result instead of calling our tools — the user must see "Claude Code isn't logged in…"-style text from its JSON result, not "no result" or a hang. → Task 5 test `TestClaudeCodeSurfacesErrorResult`.
2. **A grader that hangs** (Claude Code stuck, network stall): the run must stop at its timeout with a clear message and still delete its temp folder. → Task 5 test `TestClaudeCodeTimesOutAndCleansUp`.
3. **Re-grading with a provider that isn't set up** (no Anthropic key, no `claude` found): fail fast with the provider's reason, no network/process call, interview status and existing cards untouched. → Task 7 test `TestRegradeWithUnavailableProvider`.
4. **Recording file already missing** (deleted outside the app, or by "Delete recording" twice): `DeleteInterviewRecording` succeeds and clears the path; review page shows no player instead of an error. → Task 6 test `TestDeleteRecordingWhenFileMissing`.
5. **Tips that don't match a transcript line** (answer start shifted after a rejoin, or old data): they must still be shown (under "Other tips" at the end), never silently dropped. → Task 9 test `attachTips keeps unmatched tips`.

---

## File Structure

| File | Responsibility |
|---|---|
| `aitask.go` (new) | `aiTask`, roles, `aiProvider` interface, provider registry, `runAITask`, `ListAIProviders` |
| `aitask_tasks.go` (new) | The `scorecard` and `nudge` task builders and their JSON Schemas (moved out of `interviews_ai.go`) |
| `provider_gemini.go` (new) | Gemini Live provider; JSON Schema → Gemini schema conversion |
| `provider_anthropic.go` (new) | Anthropic API provider |
| `provider_claudecode.go` (new) | Finding `claude`, temp task/MCP files, running headless, reading the result |
| `aitask_mcp.go` (new) | The stdio MCP server behind `--ai-task-mcp` (`get_input`, `submit_result`) |
| `main.go` | Dispatch `--ai-task-mcp` before Wails starts |
| `scorecards.go` (new) | Scorecard + tip storage, summaries, deletes (repo layer) |
| `db.go` | Migration 8 |
| `interviews_ai.go` | Scoring/re-grade/nudge flows call `runAITask`; `MockInterview` gains `Scorecards`, `Tips` |
| `settings.go` | New AI provider fields, defaults, validation |
| `app.go` | Bindings: `ListAIProviders`, `RegradeInterview`, `DeleteScorecard`, `DeleteInterviewRecording`, `ListAllMockInterviews`, `TestClaudeCode`, new `NudgeAnswer` signature |
| `frontend/src/pages/Settings/SettingsPage.tsx` | AI providers section |
| `frontend/src/pages/Interview/InterviewReviewPage.tsx` (+ small parts file) | Tabs, re-grade menu, inline tips, deletes |
| `frontend/src/lib/interview.ts` | `attachTips` helper (pure, tested) |
| `frontend/src/pages/Interviews/InterviewsPage.tsx` (new) | All-interviews list |
| `frontend/src/components/NavRail.tsx`, `frontend/src/App.tsx` | Nav item + route |
| `frontend/src/pages/Interview/useLiveInterview.ts` | Pass session id and answer start to `NudgeAnswer` |

---

### Task 1: Per-run MCP server (`--ai-task-mcp`) — risk check first

Proves the Wails GUI executable can serve MCP over stdio when launched by `claude -p`, and confirms the exact Claude Code flags. Everything in Task 5 depends on this.

**Files:**
- Create: `aitask_mcp.go`, `aitask_mcp_test.go`
- Modify: `main.go` (dispatch before `wails.Run`), `go.mod`/`go.sum` (MCP SDK)

**Interfaces:**
- Produces:
  - `type mcpTaskFile struct { Instruction, Input string; Schema map[string]any; OutputPath string }` (JSON: `instruction`, `input`, `schema`, `outputPath`)
  - `const aiTaskMCPFlag = "--ai-task-mcp"`
  - `func runAITaskMCP(ctx context.Context, taskPath string, in io.Reader, out io.Writer) error` — serves until the client closes stdin.
  - MCP server name `jobtrack`; tools `get_input` (no args; returns the input text) and `submit_result` (input schema = task schema; validates required fields and types, writes the JSON to `OutputPath`, returns "Saved.").

- [ ] **Step 1: Add the MCP SDK** — `go get github.com/modelcontextprotocol/go-sdk` and read its stdio server example (server, `AddTool`, stdio transport) from the module source in the Go module cache; use its real names, not guesses.
- [ ] **Step 2: Write failing tests** (`aitask_mcp_test.go`), driving `runAITaskMCP` in-process through `io.Pipe` with the SDK's client side (or raw JSON-RPC lines):
  - `TestTaskMCPListsTwoTools`: `tools/list` returns exactly `get_input`, `submit_result`; `submit_result`'s input schema equals the task schema.
  - `TestTaskMCPGetInput`: returns the task's input text.
  - `TestTaskMCPSubmitResultWritesOutput`: a valid result is written to `OutputPath` as JSON.
  - `TestTaskMCPRejectsInvalidResult`: missing required field → tool error, no output file.
- [ ] **Step 3: Run** `go test -run TaskMCP .` — expect FAIL (undefined).
- [ ] **Step 4: Implement** `aitask_mcp.go`; in `main.go`, if `os.Args[1] == aiTaskMCPFlag`, call `runAITaskMCP(ctx, os.Args[2], os.Stdin, os.Stdout)` and exit with its status before any Wails setup.
- [ ] **Step 5: Run** the tests — expect PASS.
- [ ] **Step 6: Risk check with the real CLI (throwaway, not committed).** `wails build`, write a task file and an `mcp.json` pointing at `build/bin/jobtrack.exe --ai-task-mcp <task>`, then run `claude -p "Call get_input, then call submit_result once with your answer." --bare --strict-mcp-config --mcp-config mcp.json --allowedTools mcp__jobtrack__get_input mcp__jobtrack__submit_result --no-session-persistence --output-format json` plus the candidate "no built-in tools" flag (try `--tools ""`; check `claude --help` wording). Confirm: output file written; only our two tools available (ask it in a second run to list its tools); no permission prompt. **If the GUI build cannot serve stdio**, add `cmd/jobtrack-mcp/main.go` calling the same `runAITaskMCP` and note in the spec that the provider launches that helper instead.
- [ ] **Step 7: Record the confirmed flags** in the spec's section 3 (replace "the exact `--tools` form is confirmed in the risk-check task") and commit:
  `git add aitask_mcp.go aitask_mcp_test.go main.go go.mod go.sum docs/superpowers/specs/2026-10-07-ai-providers-design.md && git commit -m "feat: per-run MCP server for AI tasks (--ai-task-mcp)"`

### Task 2: AI task layer + Gemini provider (no behaviour change)

**Files:**
- Create: `aitask.go`, `aitask_tasks.go`, `provider_gemini.go`, `aitask_test.go`
- Modify: `interviews_ai.go` (scoring and nudge go through `runAITask`; old `scorecardSchema`/`nudgeSchema` move to `aitask_tasks.go` in JSON Schema form)

**Interfaces:**
- Produces:
  - `type aiRole int` with `roleGrading`, `roleTips`
  - `type aiTask struct { name, instruction, input string; schema map[string]any; role aiRole }`
  - `type aiResult struct { raw json.RawMessage; model string }`
  - `type aiProvider interface { id() string; label() string; unavailable(s Settings) string; run(ctx context.Context, s Settings, t aiTask) (aiResult, error) }`
  - `func providerByID(id string) (aiProvider, bool)` (registry order: gemini-live, anthropic, claude-code; Tasks 4–5 register theirs)
  - `func runAITask(ctx context.Context, s Settings, providerID string, t aiTask, out any) (model string, err error)` — unknown ID → error; `unavailable` non-empty → that reason as the error, no call; decodes `raw` into `out`.
  - `func scorecardTask(job Job, mi MockInterview, resume string) aiTask` and `func nudgeTask(question, answer string) aiTask`
  - `func geminiSchema(jsonSchema map[string]any) map[string]any` — uppercases `type`, drops `additionalProperties`, recurses into `properties`/`items`.
- Consumes: `liveStructured` (live.go), `jsonPrompt`.

- [ ] **Step 1: Failing tests** (`aitask_test.go`):
  - `TestTaskSchemasAreStandardJSONSchema`: every `type` lowercase; objects have `required` and `additionalProperties: false`.
  - `TestGeminiSchemaConversion`: `{"type":"object","properties":{"a":{"type":"string"}},"required":["a"],"additionalProperties":false}` → `{"type":"OBJECT","properties":{"a":{"type":"STRING"}},"required":["a"]}`; arrays convert `items`.
  - `TestRunAITaskUnknownAndUnavailable`: unknown ID errors; `gemini-live` with empty key returns the key reason without dialling (point `geminiLiveWSBase` at an unreachable address and assert the error is the reason, not a connection error).
  - Existing `TestScoreInterview` / nudge tests keep passing unchanged (fake Live server).
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement**; Gemini provider `run` = `liveStructured` with `geminiSchema(t.schema)`, model = `s.GeminiLiveModel`; `unavailable` = "Add your Gemini API key in Settings → AI" when key empty.
- [ ] **Step 4: Run all Go tests** — PASS. **Step 5: Commit** "refactor: AI task layer with Gemini Live as the first provider".

### Task 3: Settings for providers + `ListAIProviders`

**Files:**
- Modify: `settings.go`, `settings_test.go`, `aitask.go`, `app.go`

**Interfaces:**
- Produces: Settings fields `GradingProvider`, `TipsProvider`, `AnthropicKey`, `AnthropicModel`, `AnthropicGradingEffort`, `AnthropicTipsEffort`, `ClaudeCodePath`, `ClaudeCodeModel` (json names as in the spec); `type AIProvider struct { ID, Label, Unavailable string }` (json `id`,`label`,`unavailable`); `func ListAIProviders(s Settings) []AIProvider`; binding `App.ListAIProviders() ([]AIProvider, error)`.

- [ ] **Step 1: Failing tests:**
  - `TestSettingsAIDefaults`: a fresh store (and an old settings.json without the new fields) loads the defaults from Global Constraints.
  - `TestSettingsRejectsBadAIValues`: unknown provider ID, unknown effort → Save error.
  - `TestListAIProvidersReadiness`: order gemini-live, anthropic, claude-code; empty keys/path → each has a reason.
- [ ] **Step 2–4:** run (FAIL) → implement → run (PASS). Regenerate bindings.
- [ ] **Step 5: Commit** "feat: AI provider settings and readiness list".

### Task 4: Anthropic API provider

**Files:**
- Create: `provider_anthropic.go`, `provider_anthropic_test.go`
- Modify: `go.mod`/`go.sum`, `aitask.go` (register)

**Interfaces:**
- Consumes: `aiTask`, `aiResult`, `aiProvider`, Settings fields from Task 3.
- Produces: `anthropicProvider` (id `anthropic`); `var anthropicBaseURL = ""` (empty = SDK default; tests set an httptest URL, passed via `option.WithBaseURL`).

- [ ] **Step 1: Add the SDK** (`go get github.com/anthropics/anthropic-sdk-go`). Use `client.Messages.New` (or the beta Messages path if `fallbacks` needs it) with `System`, one user text message, `OutputConfig` carrying `Effort` and the JSON-Schema `Format`; let the compiler confirm field names.
- [ ] **Step 2: Failing tests** against `httptest.NewServer`:
  - `TestAnthropicRequestShape`: body has `model` = setting, `output_config.effort` = role's effort, `output_config.format` with the task schema, `max_tokens` 16000 (grading) / 1024 (tips), the fallback beta header; header `x-api-key` = key.
  - `TestAnthropicReturnsResultAndModel`: response with a text block of JSON → `raw` is that JSON, `model` = response `model`.
  - `TestAnthropicRefusal`: `stop_reason: "refusal"` → error mentioning it declined; no decode.
  - `TestAnthropicErrorsAreReadableAndHideKey`: 401 → "Anthropic rejected the API key"; 429 with `retry-after: 30` → mentions waiting 30 s; 529/500 → "temporarily unavailable"; key absent from every message.
  - `unavailable`: empty key → "Add your Anthropic API key in Settings".
- [ ] **Step 3–5:** run (FAIL) → implement → run (PASS). Disable SDK auto-retries for 4xx surfacing but keep its 429/5xx retries (default) — the 429 test serves 429 on every attempt.
- [ ] **Step 6: Commit** "feat: Anthropic API provider with structured outputs".

### Task 5: Claude Code provider (headless + temporary MCP)

**Files:**
- Create: `provider_claudecode.go`, `provider_claudecode_test.go`, `testdata/fakeclaude/main.go`
- Modify: `aitask.go` (register), `app.go` (`TestClaudeCode` binding)

**Interfaces:**
- Consumes: `mcpTaskFile`, `aiTaskMCPFlag` (Task 1), confirmed flags (Task 1 Step 7), `hideConsole`.
- Produces: `claudeCodeProvider` (id `claude-code`); `func findClaudeCode(s Settings) (string, error)`; `func claudeCodeArgs(t aiTask, mcpConfigPath string, s Settings) []string`; `var claudeCodeTimeout = map[aiRole]time.Duration{roleGrading: 5 * time.Minute, roleTips: 60 * time.Second}` (tests shorten it); `func (a *App) TestClaudeCode() (string, error)` returning `claude --version` output.
- Run flow per spec section 3; `model` in `aiResult` = from the JSON result if it reports one, else `s.ClaudeCodeModel`, else "".

- [ ] **Step 1: Fake CLI** — `testdata/fakeclaude/main.go`, built by the test with `go build` into a temp dir. Behaviour by env var: `FAKE_MODE=ok` reads `--mcp-config`, parses the task file path from it, writes a canned result to `outputPath`, prints `{"is_error":false,"result":"done"}`; `FAKE_MODE=error` prints `{"is_error":true,"result":"Invalid API key · Please run /login"}` and exits 1; `FAKE_MODE=sleep` sleeps 10 s; it also writes its argv to a file named by `FAKE_ARGS`.
- [ ] **Step 2: Failing tests:**
  - `TestClaudeCodeArgs`: contains `-p`, `--setting-sources ""`, `--strict-mcp-config`, `--mcp-config <path>`, `--tools ""`, `--disable-slash-commands`, both `--allowedTools` entries, `--no-session-persistence`, `--output-format json`, `--system-prompt <instruction>`; never `--bare`; `--model x` only when set.
  - `TestClaudeCodeRunsAndReadsResult` (`ok`): result decoded; temp folder gone afterwards; mcp.json's server command is this test binary path + `--ai-task-mcp`.
  - `TestClaudeCodeSurfacesErrorResult` (`error`): error contains "Please run /login".
  - `TestClaudeCodeTimesOutAndCleansUp` (`sleep`, timeout 200 ms): error says it timed out; temp folder gone.
  - `TestFindClaudeCode`: explicit path used; missing path → error; empty path falls back to PATH lookup.
- [ ] **Step 3–5:** run (FAIL) → implement → run (PASS). The MCP server command is `os.Executable()` (or the Task 1 helper if the risk check required it).
- [ ] **Step 6: Commit** "feat: Claude Code provider with a per-run MCP server".

### Task 6: Migration 8 — scorecards and tips tables, repo layer

**Files:**
- Create: `scorecards.go`, `scorecards_test.go`
- Modify: `db.go` (migration 8), `interviews_ai.go` (`MockInterview` fields, `scanMock`, `markDone`)

**Interfaces:**
- Produces:
  - `type ScorecardResult struct { Provider, Model string; Scorecard Scorecard; CreatedAt string }` (json `provider`,`model`,`scorecard`,`createdAt`)
  - `type InterviewTip struct { AnswerAtMs int64; Kind, Text, Provider, Model string }` (json `answerAtMs`,`kind`,`text`,`provider`,`model`)
  - `MockInterview` gains `Scorecards []ScorecardResult` (newest first) and `Tips []InterviewTip` (by `answerAtMs`); `Scorecard *Scorecard` = newest card.
  - `func (r *Repo) saveScorecard(id, provider, model string, c Scorecard) error` (upsert on `(mock_interview_id, provider)`)
  - New status constant `MockUnscored = "unscored"`: the interview ended but has no scorecard (shown as "Not scored" with a "Grade now" button).
  - `func (r *Repo) DeleteScorecard(id, provider string) error` — deletes that provider's card; when it was the last card, sets the interview's status to `MockUnscored`.
  - `func (r *Repo) saveTip(id string, t InterviewTip) error`
  - `func (r *Repo) DeleteInterviewRecording(id string) error` (remove file if present, clear `recording_path`)
  - `type MockInterviewSummary struct { ID, JobID, Company, Position, Kind, Persona, InterviewerName, Status, StartedAt string; Minutes int; LatestOverall *ScoreSet; Graders []string; HasRecording, HasTips bool }`
  - `func (r *Repo) ListAllMockInterviews() ([]MockInterviewSummary, error)` (newest first, no transcript/tip/card bodies)
- Migration 8 (SQL): create `scorecards` and `interview_tips` per spec 5 / 5a with indexes on `mock_interview_id`; `INSERT INTO scorecards SELECT … FROM mock_interviews WHERE scorecard != ''` with provider `gemini-live`; `ALTER TABLE mock_interviews DROP COLUMN scorecard`.

- [ ] **Step 1: Failing tests:**
  - `TestMigration8MovesScorecards`: open a DB at migration 7 (`openDBWith(path, migrations[:7])`), insert an interview with a scorecard, reopen with all migrations → `Scorecards` has one `gemini-live` card with the same summary; column gone.
  - `TestScorecardUpsertPerProvider`: save gemini then anthropic → 2 cards, newest first; save anthropic again → still 2, anthropic replaced.
  - `TestDeleteScorecardLastOneUnscores`: delete both → `Scorecards` empty, status `unscored`.
  - `TestTipsSavedAndCascade`: two tips saved and returned in `answerAtMs` order; deleting the interview removes them.
  - `TestDeleteRecordingWhenFileMissing` (Review Focus 4): path set to a non-existent file → no error, path cleared, `HasRecording` false.
  - `TestListAllMockInterviews`: two jobs' interviews, newest first, `Graders` and flags correct.
- [ ] **Step 2–4:** run (FAIL) → implement → run (PASS); update `markDone` to call `saveScorecard`.
- [ ] **Step 5: Commit** "feat: keep scorecards per provider and coaching tips (migration 8)".

### Task 7: Scoring, re-grade and tip flows + bindings

**Files:**
- Modify: `interviews_ai.go`, `app.go`, `interviews_ai_test.go`

**Interfaces:**
- Consumes: `runAITask`, `scorecardTask`, `nudgeTask` (Task 2), repo functions (Task 6).
- Produces:
  - `func scoreInterview(ctx, r *Repo, s Settings, id string) (MockInterview, error)` — uses `s.GradingProvider`; status `scoring` → `done` / `failed` (failed only when no cards exist).
  - `func regradeInterview(ctx, r *Repo, s Settings, id, provider string) (MockInterview, error)` — never changes status on failure; keeps cards.
  - `func nudgeAnswer(ctx, r *Repo, s Settings, sessionID, question, answer string, answerAtMs int64) (Nudge, error)` — runs on `s.TipsProvider`, saves the tip with provider + model.
  - Bindings: `ScoreInterview(id)`, `RegradeInterview(id, provider)`, `NudgeAnswer(sessionID, question, answer string, answerAtMs int64)`, `DeleteScorecard(id, provider)`, `DeleteInterviewRecording(id)`, `ListAllMockInterviews()`.

- [ ] **Step 1: Failing tests** (fake Live server from `live_test.go`):
  - `TestScoreInterviewUsesGradingProviderAndSavesCard`.
  - `TestRegradeAddsSecondCard`: gemini card exists; re-grade with a provider whose fake returns a card → two cards.
  - `TestRegradeFailureKeepsStatusAndCards`: fake closes with an error → status still `done`, one card.
  - `TestRegradeWithUnavailableProvider` (Review Focus 3): `anthropic` with no key → error is the reason; no request reached any fake server; status/cards unchanged.
  - `TestNudgeSavesTip`: tip saved with `answerAtMs`, provider `gemini-live`, model = live model.
- [ ] **Step 2–4:** run (FAIL) → implement → run (PASS). Regenerate bindings; fix TypeScript call sites that no longer compile (`NudgeAnswer` signature) minimally — the UI work is Tasks 8–10.
- [ ] **Step 5: Commit** "feat: grade, re-grade and save tips through the chosen provider".

### Task 8: Settings page — AI providers section

**Files:**
- Modify: `frontend/src/pages/Settings/SettingsPage.tsx` (extract an `AIProvidersSection` component into `frontend/src/pages/Settings/AIProvidersSection.tsx` to keep the page small)

**Interfaces:**
- Consumes: `ListAIProviders`, `TestClaudeCode`, `main.Settings` new fields.

- [ ] **Step 1:** Grading and Coaching tips selects (options from `ListAIProviders`, unavailable ones labelled "(setup needed)"; tips select shows "Recommended: Gemini Live — answers in about a second").
- [ ] **Step 2:** Per-provider blocks: Gemini (key, Live model — moved from the old AI section); Anthropic (key as password, model, grading effort, tips effort selects); Claude Code (path with "Leave empty to find it automatically", model, **Test** button showing the version or the error).
- [ ] **Step 3:** `npx tsc --noEmit -p .`, `npx vitest run`, `npm run build` pass. **Step 4: Commit** "feat: AI providers section in Settings".

### Task 9: Review page — tabs, re-grade, inline tips, deletes

**Files:**
- Modify: `frontend/src/pages/Interview/InterviewReviewPage.tsx`; Create: `frontend/src/pages/Interview/ReviewParts.tsx` (ScorecardTabs, RegradeMenu, TranscriptWithTips); Modify: `frontend/src/lib/interview.ts`, `frontend/src/lib/interview.test.ts`

**Interfaces:**
- Produces: `export function attachTips(lines: main.TranscriptLine[], tips: main.InterviewTip[]): { byLine: Map<number, main.InterviewTip[]>; unmatched: main.InterviewTip[] }` — a tip belongs to the candidate line whose `atMs` equals its `answerAtMs` (within 1500 ms); otherwise `unmatched`.

- [ ] **Step 1: Failing vitest tests** (`interview.test.ts`):
  - `attachTips matches tips to the answer they were about`.
  - `attachTips keeps unmatched tips` (Review Focus 5): a tip at 99_000 with no line near it lands in `unmatched`.
- [ ] **Step 2–4:** run (FAIL) → implement `attachTips` → run (PASS).
- [ ] **Step 5:** UI: tabs when `scorecards.length > 1` (label `Provider · model`); "Re-grade with…" menu from `ListAIProviders` (disabled + reason when unavailable; spinner while running; toast on failure); tips rendered under their line and an "Other tips" list for `unmatched`; "Delete this scorecard" per tab, "Delete recording" by the player, both via `confirmDialog`; status `unscored` shows "Grade now" (calls `ScoreInterview`).
- [ ] **Step 6:** tsc, vitest, build pass. **Step 7: Commit** "feat: review page shows every grader, saved tips and per-part deletes".

### Task 10: Interviews page + live page passes tip anchors

**Files:**
- Create: `frontend/src/pages/Interviews/InterviewsPage.tsx`
- Modify: `frontend/src/App.tsx` (route `interviews` — keep the existing `interviews/:id` and `interviews/:id/live` routes), `frontend/src/components/NavRail.tsx` (item "Interviews"), `frontend/src/pages/Interview/useLiveInterview.ts` (`NudgeAnswer(id, e.question, e.answer, e.startMs)`)

**Interfaces:**
- Consumes: `ListAllMockInterviews`, `DeleteMockInterview`, `useInterviewOptions`/`kindLabel`, `openMenu`, `confirmDialog`, `useLoad`.

- [ ] **Step 1:** Page: job filter select; rows (date, job · company, kind label, minutes, interviewer, latest average via `averageScore`, grader badges, recording/tips icons, status chip for scoring/failed/unscored); click → `/interviews/:id`; context menu Open / Delete (confirm, then `notifyDataChanged`); empty state.
- [ ] **Step 2:** Nav item and route; live page passes the session id and answer start.
- [ ] **Step 3:** tsc, vitest, build pass. **Step 4: Commit** "feat: Interviews page listing every mock interview".

### Task 11: Real end-to-end check and docs

**Files:**
- Modify: `docs/superpowers/specs/2026-10-07-ai-providers-design.md` (status → Implemented, any deviations), memory note if behaviour changed.

- [ ] **Step 1:** Temporary, uncommitted test (as done for the Live scoring check): copy the user's `jobtrack.db` **and** `jobtrack.db-wal`, open the copy, and score the latest interview with each provider the user has set up (Gemini Live; Anthropic if a key is configured; Claude Code via the real `claude`). Log provider, model, duration, scores. Close the DB before the test ends. Delete the test file.
- [ ] **Step 2:** Report results honestly (which providers ran, which were skipped for missing setup).
- [ ] **Step 3:** Update the spec status/deviations; commit "docs: AI providers implemented".
