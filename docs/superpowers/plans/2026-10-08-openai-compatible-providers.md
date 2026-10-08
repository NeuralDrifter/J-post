# OpenAI-compatible Providers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Grading, coaching tips and question plans can run on OpenAI, DeepSeek, Ollama, or any OpenAI-compatible service, through one provider built on OpenAI's official Go SDK.

**Architecture:** One `openAIProvider` type, configured by a preset (ID, label, base URL, answer mode, settings accessors), implements the existing `aiProvider` interface in `aitask.go`. Each preset is a separate entry in `aiProviders()`. Every answer goes through the same safety net: tolerant JSON extraction → schema validation (the existing `resolveSchema`) → one repair retry. Settings gets one block per preset with **Load models** and **Test** buttons.

**Tech Stack:** Go 1.26 (Wails v2), `github.com/openai/openai-go` (official; use its current major version), `github.com/google/jsonschema-go` (already a dependency), React + TypeScript (vitest).

**Spec:** `docs/superpowers/specs/2026-10-08-openai-compatible-providers-design.md`

**Plan style (user preference):** tasks list files, interfaces and tests. Test sketches are given; full implementations are not. Write the code to satisfy the interfaces and tests.

**Branch:** `feature/openai-providers` from `main`. If `fix/plan-minors` isn't merged yet, branch from it instead.

## Global Constraints

- Provider IDs, exactly: `openai`, `deepseek`, `ollama`, `openai-compatible`. Labels: "OpenAI", "DeepSeek", "Ollama (local)", "OpenAI-compatible (custom)".
- Base URLs: `https://api.openai.com/v1`, `https://api.deepseek.com/v1`, default Ollama `http://localhost:11434/v1`; custom is user-entered.
- Answer modes: OpenAI `json_schema` (strict), DeepSeek `json_object`, Ollama `json_schema`, custom from `customAIMode` (`json_schema` / `json_object` / `plain`, default `plain`).
- In `json_object` and `plain` modes the instruction gets the schema appended as text, and it must contain the word "json".
- DeepSeek uses the OpenAI-style endpoint, never `/anthropic`.
- Instruction (system message) first and byte-identical between runs, varying input last. This keeps DeepSeek's prefix cache hitting.
- Safety net on every mode: extract JSON → validate against the task schema → on failure (including an empty answer) one repair retry with the validation error → second failure is an error.
- Timeouts / max output tokens per role, same as `provider_anthropic.go`: grading 5 min / 16000, tips 60 s / 1024, planning 2 min / 16000. SDK max retries 1.
- No hard-coded model names: model fields default to "", and `unavailable()` asks for one.
- Keys never appear in error messages or logs.
- Gemini stays on Live; no Qwen or other Alibaba services; no named presets beyond the four.
- Every task ends with `go vet ./...` and `go test ./...` passing. When frontend files changed, also `npx tsc --noEmit -p .` and `npx vitest run` in `frontend/`. After a Go binding change, run `wails generate module` and delete the stray `jobtrack.exe` it leaves.
- No AI attribution trailers in commits; AI help is credited by model name on the licenses page (`BUILT_WITH`) and in the README Credits.

## Review Focus

1. **Model wraps JSON in prose or a code fence** (common with DeepSeek and small Ollama models): it must still parse. → Task 2 tests `TestExtractJSONFenced`, `TestExtractJSONProse`.
2. **DeepSeek returns empty content in JSON mode** (documented): treated as a bad answer, repaired once, never saved as an empty scorecard. → Task 3 test `TestOpenAIEmptyAnswerIsRepaired`.
3. **Ollama not running** (connection refused): a plain "Ollama isn't running at <url>", fast, not a 5-minute hang. → Task 4 test `TestOpenAIConnectionRefused`.
4. **A custom server that rejects `response_format`** (some return 400 "unsupported parameter"): the error names the mode and suggests switching to `plain`. → Task 4 test `TestOpenAIUnsupportedResponseFormat`.
5. **A user switches grading to a provider, then clears its key or model**: `Save` still succeeds (the provider just shows "setup needed"), and grading fails fast with the reason before any network call. → Task 1 test `TestOpenAIProviderUnavailableReasons`, plus the existing `runAITask` path.

---

## File Structure

| File | Responsibility |
|---|---|
| `provider_openai.go` (new) | Presets, `openAIProvider` (`id`/`label`/`unavailable`/`run`), request building, repair retry, model listing |
| `provider_openai_errors.go` (new) | Map SDK/HTTP/network errors to the spec's messages |
| `aianswer.go` (new) | `extractJSON` and `validateAnswer`, shared and provider-neutral |
| `provider_openai_test.go`, `provider_openai_errors_test.go`, `aianswer_test.go` (new) | Tests against an `httptest` fake server |
| `aitask.go` | Add the four IDs and register the presets in `aiProviders()` |
| `settings.go` | New fields, defaults, `customAIMode` validation |
| `app.go` | Bindings `ListAIModels`, `TestAIProvider` |
| `frontend/src/pages/Settings/AIProvidersSection.tsx` | Four provider blocks, Load models, Test |
| `frontend/src/pages/Settings/ModelPicker.tsx` (new) + test | Dropdown filled from `ListAIModels`, free-text fallback |
| spec | Status line and live-run results |

---

### Task 1: Presets, settings fields and provider registration

**Files:** Create `provider_openai.go` (presets, type, `id`/`label`/`unavailable`; `run` returns `errors.New("not implemented")` until Task 3). Modify `aitask.go`, `settings.go`. Test `provider_openai_test.go`, `settings_test.go`.

**Interfaces (produces):**
- Constants `providerOpenAI = "openai"`, `providerDeepSeek = "deepseek"`, `providerOllama = "ollama"`, `providerOpenAICompatible = "openai-compatible"`.
- `type answerMode string` with `modeJSONSchema = "json_schema"`, `modeJSONObject = "json_object"`, `modePlain = "plain"`.
- `type openAIPreset struct { id, label string; needsKey bool; conn func(Settings) openAIConn }`
- `type openAIConn struct { baseURL, key, model string; mode answerMode }`, the resolved per-run connection.
- `type openAIProvider struct{ p openAIPreset }` implementing `aiProvider`.
- `var openAIPresets = []openAIPreset{…}` in display order: OpenAI, DeepSeek, Ollama, custom.
- `aiProviders()` returns Gemini, Anthropic, Claude Code, then the four.
- Settings fields (JSON names exact): `openaiKey`, `openaiModel`, `deepseekKey`, `deepseekModel`, `ollamaURL`, `ollamaModel`, `customAIBaseURL`, `customAIKey`, `customAIModel`, `customAIMode`.
- Defaults: `ollamaURL` = `http://localhost:11434/v1`, `customAIMode` = `plain`. Trim all URL and model fields. `Save` rejects a `customAIMode` not in the three modes.

**`unavailable` reasons** (exact text):
- Missing key: "Add your <Label> API key in Settings → AI". Not checked for Ollama or custom.
- Missing model: "Choose a <Label> model in Settings → AI"
- Custom with no base URL: "Enter the server address in Settings → AI"

- [ ] **Step 1: Write failing tests**
  - `TestOpenAIProviderUnavailableReasons`: table over the four presets × {no key, no model, no URL (custom), ready}, expecting the exact strings above.
  - `TestAIProvidersOrder`: IDs in order `gemini-live, anthropic, claude-code, openai, deepseek, ollama, openai-compatible`.
  - `TestSettingsOpenAIDefaults`: a load from empty gives `ollamaURL` and `customAIMode` defaults. `Save` with `customAIMode: "xml"` errors. `Save` with `gradingProvider: "deepseek"` and no key succeeds.
- [ ] **Step 2:** Run `go test ./... -run 'OpenAI|AIProvidersOrder'`. Expected: FAIL (undefined).
- [ ] **Step 3:** Implement. `go get github.com/openai/openai-go/<current major>` belongs in Task 3; this task needs no SDK.
- [ ] **Step 4:** Run the tests and `go vet ./...`. Expected: PASS.
- [ ] **Step 5:** Commit `feat: OpenAI-compatible provider presets and settings`.

---

### Task 2: Tolerant JSON extraction and schema validation

**Files:** Create `aianswer.go`, `aianswer_test.go`.

**Interfaces (produces):**
- `func extractJSON(text string) (json.RawMessage, error)`: trims space. If there's a ```` ```json ```` / ```` ``` ```` fence, uses its contents. Then takes the outermost `{…}`. Errors with `errEmptyAnswer` when the text is blank, `errNoJSON` when there are no braces, or the JSON syntax error.
- `func validateAnswer(raw json.RawMessage, schema map[string]any) error`: uses `resolveSchema` from `aitask_mcp.go`, unmarshals to `any`, then `Validate`. The returned message lists what's wrong, so it can be sent back in the repair retry.
- `var errEmptyAnswer, errNoJSON error`.

Tricky part (same as Reactive Resume's `generate-json.ts`):
```go
if m := fenceRe.FindStringSubmatch(text); m != nil { text = m[1] } // fenceRe = (?s)```(?:json)?\s*(.*?)\s*```
start, end := strings.IndexByte(text, '{'), strings.LastIndexByte(text, '}')
```

- [ ] **Step 1: Write failing tests:** `TestExtractJSONPlain`, `TestExtractJSONFenced` (```` ```json\n{…}\n``` ````), `TestExtractJSONProse` ("Here is the result: {…} Hope that helps"), `TestExtractJSONEmpty` (→ `errEmptyAnswer`), `TestExtractJSONNoBraces`, `TestValidateAnswerMissingRequired`, `TestValidateAnswerExtraProperty` (`additionalProperties: false`), `TestValidateAnswerOK`. Use the real `scorecard` task schema from `aitask_tasks.go` for the validation cases.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run. Expected: PASS.
- [ ] **Step 5:** Commit `feat: tolerant JSON extraction and schema check for AI answers`.

---

### Task 3: `run`: requests, answer modes, repair retry, cache logging

**Files:** Modify `provider_openai.go`. Test `provider_openai_test.go`. Add the SDK to `go.mod`.

**Interfaces:**
- Consumes: Task 1 presets/conn; Task 2 `extractJSON`, `validateAnswer`.
- Produces: `func (o openAIProvider) run(ctx, s Settings, t aiTask) (aiResult, error)`; `var openAIMaxRetries = 1`; `openAITimeout` and `openAIMaxTokens` maps keyed by `aiRole` (same values as Anthropic); `func openAIInstruction(t aiTask, mode answerMode) string`.

**Behaviour:**
- Client: `option.WithBaseURL(conn.baseURL)`, `option.WithAPIKey(conn.key)` (when empty, a placeholder like `"none"`, since Ollama ignores it and the SDK may require one), `option.WithMaxRetries(openAIMaxRetries)`.
- Messages: system = `openAIInstruction(t, mode)`, user = `t.input`. The instruction is `t.instruction` alone for `json_schema`. For the other two modes it's `t.instruction + "\n\nReply with only a json object matching this JSON Schema:\n" + <schema JSON, stable key order>`.
- `response_format`: `json_schema` → schema named after `t.name`, `strict: true`; `json_object` → `{type: json_object}`; `plain` → omitted.
- `max_completion_tokens` from the role map (OpenAI's current field; check whether DeepSeek/Ollama need `max_tokens` during the live runs in Task 7 and record it in the spec).
- Read `choices[0].message.content` only (ignore any `reasoning_content`).
- extract → validate. On error: **one** more request with the same messages plus the assistant's bad answer and a user message: "That answer wasn't valid: <error>. Reply again with only the corrected json object." Second failure → `fmt.Errorf("%s's answer wasn't in the expected format: %v", label, err)`.
- `aiResult.model` = response `model`.
- Log `usage.prompt_tokens`, and when present `prompt_cache_hit_tokens` / `prompt_cache_miss_tokens` (DeepSeek extras; read them from the raw JSON), with `log.Printf` as one line per run.

**Tests** (fake server that records request bodies and returns queued responses; point the preset at it through settings):
- [ ] **Step 1: Write failing tests:**
  - `TestOpenAIJSONSchemaRequest`: body has `response_format.type == "json_schema"`, `strict: true`, the task schema; system message is exactly `t.instruction`; result decodes.
  - `TestOpenAIJSONObjectRequest`: `type == "json_object"`; system message contains "json" and the schema text; system message identical across two runs (cache prefix).
  - `TestOpenAIPlainRequest`: no `response_format` key.
  - `TestOpenAIProseAnswerParses`: content "Sure! ```json {…}```" → success, one request.
  - `TestOpenAIEmptyAnswerIsRepaired`: first content "", second valid → success, 2 requests, second carries the repair message.
  - `TestOpenAIInvalidTwiceFails`: two invalid answers → "wasn't in the expected format", exactly 2 requests.
  - `TestOpenAIReportsModel`: response `model` comes back in `aiResult.model`.
  - `TestOpenAINoKeyForOllama`: no `Authorization: Bearer <real key>` leaks; request still sent.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** `go get github.com/openai/openai-go/<current major>@latest`, then implement.
- [ ] **Step 4:** Run with `go vet ./...`. Expected: PASS.
- [ ] **Step 5:** Commit `feat: OpenAI-compatible provider runs tasks with repair retry`.

---

### Task 4: Error messages

**Files:** Create `provider_openai_errors.go`, `provider_openai_errors_test.go`. `run` wraps every request error through it.

**Interfaces:** `func openAIError(err error, label, model, baseURL string) error`.

| Condition | Message |
|---|---|
| 401 / 403 | "<Label> rejected the API key" |
| 404 mentioning the model | "<Label> doesn't have the model <model>" |
| 402, or body says insufficient balance/credit | "<Label> says the account is out of credit" |
| 429 | "<Label> is rate limiting requests", plus " — try again in N s" when `retry-after` is present |
| 400 mentioning `response_format` / unsupported | "<Label> doesn't accept this answer mode; set the mode to plain in Settings → AI" |
| 5xx | "<Label> is unavailable right now" |
| connection refused / DNS failure | Ollama: "Ollama isn't running at <baseURL>"; others: "Couldn't reach <Label> at <baseURL>" |
| context deadline | "<Label> took too long to answer" |

- [ ] **Step 1: Write failing tests:** one per row (`TestOpenAIBadKey`, `TestOpenAIUnknownModel`, `TestOpenAIOutOfCredit`, `TestOpenAIRateLimitedRetryAfter`, `TestOpenAIUnsupportedResponseFormat`, `TestOpenAIServerError`, `TestOpenAIConnectionRefused` with a closed listener's address, `TestOpenAITimeout`). Each also asserts the key string isn't in the message.
- [ ] **Step 2–4:** Fail, implement, pass.
- [ ] **Step 5:** Commit `feat: readable errors for OpenAI-compatible providers`.

---

### Task 5: Bindings: list models and test a provider

**Files:** Modify `provider_openai.go`, `app.go`. Test `provider_openai_test.go`. Run `wails generate module`.

**Interfaces (produces):**
- `func (o openAIProvider) listModels(ctx, s Settings) ([]string, error)`: `GET /models` via the SDK, sorted IDs, errors through `openAIError`.
- `func (a *App) ListAIModels(providerID string, s Settings) ([]string, error)`: takes the **unsaved** form settings; errors for non-OpenAI-style IDs.
- `func (a *App) TestAIProvider(providerID string, s Settings) (AIProviderTest, error)` runs a tiny built-in task: instruction "Reply with a json object {\"ok\": true}.", schema `{ok: boolean}`, role tips. Works for any provider ID.
- `type AIProviderTest struct { Model string `json:"model"`; Millis int64 `json:"millis"` }`.

- [ ] **Step 1: Write failing tests:** `TestListModelsSorted` (fake `/models` with 3 IDs out of order), `TestListModelsBadKey` (401 → key message), `TestTestAIProviderReportsModelAndTime`, `TestTestAIProviderUnavailable` (no model → the unavailable reason, no request sent).
- [ ] **Step 2–4:** Fail, implement, pass. Run `wails generate module`, then delete the stray `jobtrack.exe`.
- [ ] **Step 5:** Commit `feat: list models and test AI providers from Settings`.

---

### Task 6: Settings UI

**Files:** Modify `frontend/src/pages/Settings/AIProvidersSection.tsx`. Create `frontend/src/pages/Settings/ModelPicker.tsx` and `ModelPicker.test.tsx`.

**Interfaces:**
- `ModelPicker({ providerId, settings, value, onChange })`: a text input plus a **Load models** button. On success it renders a `<select>` of models (keeping the current value even if it's not in the list) with an "Other…" option that returns to the text input. Errors go through `api()` and show a toast, as elsewhere.
- A shared **Test** button per block calls `TestAIProvider(id, s)` → toast "DeepSeek answered in 1.2 s (deepseek-…)".

**Blocks** (after Claude Code, using the existing `ProviderBlock`, `Field` and `LinkButton`):
- **OpenAI:** key, model, link `https://platform.openai.com/api-keys`.
- **DeepSeek:** key, model, link `https://platform.deepseek.com/api_keys`, and a privacy note in the existing warning style: "DeepSeek processes and stores requests on servers in China. See its privacy policy before sending your resume or interviews." (Confirm against DeepSeek's current privacy policy when building; adjust the wording to match it.)
- **Ollama (local):** server address, model, note "Runs models on your own computer — free, nothing leaves your PC. Install from ollama.com and pull a model first.", link `https://ollama.com/download`.
- **OpenAI-compatible (custom):** server address, key (optional), model, answer-mode select (`plain` / `json_object` / `json_schema`, with a one-line hint: "Use plain if the server rejects the others").
- Update the recommendation paragraph to mention the new providers in one sentence.

- [ ] **Step 1: Write failing tests** (`ModelPicker.test.tsx`, mocking `ListAIModels`): renders text input initially; Load fills a select; current value kept when missing from the list; "Other…" returns to text input; a failed load keeps the text input.
- [ ] **Step 2–4:** Fail, implement, pass (`npx tsc --noEmit -p .`, `npx vitest run`).
- [ ] **Step 5:** Commit `feat: Settings blocks for OpenAI, DeepSeek, Ollama and custom providers`.

---

### Task 7: Live verification, docs

**Files:** Modify the spec.

- [ ] **Step 1:** (No third-party notice: no code is copied. See the spec, section 1.)
- [ ] **Step 2: Live runs on a copy of the data** (`JOBTRACK_DATA_DIR` pointing at a scratch copy):
  - DeepSeek with the user's key: grade one past interview, one tip, one question plan. Record model, time, valid/invalid answers, repair-retry count, and cache hit/miss tokens on a second identical run.
  - Ollama, if installed: the same three tasks with one small model.
  - OpenAI: fake server only, unless a key is available.
  - Custom: point it at DeepSeek's URL in `plain` mode once, to exercise that mode on a real server.
- [ ] **Step 3:** Update the spec: Status → Implemented (branch `feature/openai-providers`), the results from Step 2, any deviations (e.g. `max_tokens` vs `max_completion_tokens`), and which presets were verified live.
- [ ] **Step 4:** Full check: `go vet ./...`, `go test ./...`, frontend `tsc` + `vitest`.
- [ ] **Step 5:** Commit `docs: OpenAI-compatible providers implemented; live results`.
