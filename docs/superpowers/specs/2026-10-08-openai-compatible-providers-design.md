# OpenAI-compatible providers (OpenAI, DeepSeek, Ollama, custom) — Design Spec

**Date:** 2026-10-08 · **Status:** Implemented (branch feature/openai-providers); live runs pending · **Builds on:** [AI providers](2026-10-07-ai-providers-design.md) (the task/provider layer in `aitask.go`)

**Deviations found while building:**
- The SDK client is built from `openai.NewChatCompletionService` / `NewModelService`, not `openai.NewClient`. `NewClient` adds `OPENAI_API_KEY`, `OPENAI_ORG_ID`, `OPENAI_BASE_URL` and `OPENAI_CUSTOM_HEADERS` from the environment, which would send an OpenAI key to DeepSeek, Ollama or a custom server. A test pins this.
- `max_completion_tokens` for the OpenAI preset, `max_tokens` for the others (the field DeepSeek and Ollama document).
- DeepSeek reports an unknown model as a 400 "Model Not Exist", so the unknown-model message also matches on the body, not only 404.
- Missing model text is "Choose a model for <Label> in Settings → AI" (reads better than "a OpenAI model").
- SDK: `github.com/openai/openai-go/v3` v3.73.0 (Apache-2.0).

**Added while building: LM Studio (local)** (`lmstudio`, default `http://localhost:1234/v1`, `json_schema` mode, optional API token for when "Require Authentication" is on; a 401 without a token says where to add one). Settings fields `lmStudioURL`, `lmStudioKey`, `lmStudioModel`.

**Live run, LM Studio (2026-10-08, `google/gemma-3-1b`, authentication off):** model list loaded (5 models). Tip 4.6 s / 2.1 s on a repeat, grading 34 s, question plan 48 s (passes `InterviewPlan.validate`). All answers were schema-valid on the first try, with no repair retries. Answer quality from a 1B model wasn't judged.

**Live runs still to do:** there's no DeepSeek key or Ollama on the build machine. Run `JOBTRACK_LIVE_DEEPSEEK_KEY=… go test -run TestLive -v` (and `JOBTRACK_LIVE_OLLAMA_MODEL=…` with Ollama running), then record the models, times, cache hit/miss lines and any repair retries here. OpenAI stays fake-server-only until a key is available.

## Goal

Grading, coaching tips and question plans can run on OpenAI-style APIs as well as Gemini Live, the Anthropic API and Claude Code. One implementation, built on OpenAI's official Go SDK, serves every provider that speaks the OpenAI Chat Completions format.

**Only providers we can test ship as presets.** Each preset must be checked against the real service before it is listed. A provider we can't test isn't listed by name; users can still reach it through **OpenAI-compatible (custom)**.

**One place for AI.** When Reactive Resume's features are brought in later (ATS writing review, "improve", PDF/Word import, cover-letter drafts), each becomes another `aiTask` with its prompt adapted from `packages/ai/src/prompts/`. They use these same providers and settings; their Vercel AI SDK provider code is not ported.

**Out of scope:** Qwen (not offered); Groq, Mistral, xAI, OpenRouter and similar as named presets (reachable through custom); Gemini through Google's OpenAI-compatible endpoint (Gemini stays on Live); streaming; the live voice interview.

## 1. Where the ideas come from

Reviewed `reference/3rd_party/reactive-resume` (MIT). It supports 16 providers through Vercel's AI SDK. Its own code adds three things worth copying:

- **Plain-text JSON with tolerant parsing** (`packages/api/src/features/ai/generate-json.ts`): ask for JSON in the prompt, strip a code fence, take the outermost `{…}`, then validate. They avoid structured-output features because providers implement them unevenly.
- **The default base URL table** (`packages/ai/src/types.ts`).
- **Friendly error messages** per failure type (`packages/api/src/features/ai/service.ts`).

The per-provider wire code lives in the AI SDK packages, not in their repo. We use OpenAI's SDK for that instead. Their tests mock providers, so "known working" there rests on the SDK and their users, not on their own provider tests.

No code is copied: the base URLs are public facts from each provider's docs, and the parsing approach is reimplemented in Go. MIT's notice requirement covers copies of the code, so none is needed here. It will be needed if Reactive Resume's ATS scanner code is ported later.

## 2. Providers

All four share one file, `provider_openai.go`, and one `openAIProvider` type configured by a preset:

| ID | Label | Base URL | Structured answer mode | How it gets tested |
|---|---|---|---|---|
| `openai` | OpenAI | `https://api.openai.com/v1` | `json_schema` (strict) | Fake server; real run only if a key becomes available |
| `deepseek` | DeepSeek | `https://api.deepseek.com/v1` | `json_object` (DeepSeek documents only this type, not `json_schema`) | **Real runs with the user's key** |
| `ollama` | Ollama (local) | `http://localhost:11434/v1` | `json_schema` (confirm while building) | Real runs if Ollama is installed; free and local |
| `lmstudio` | LM Studio (local) | `http://localhost:1234/v1` | `json_schema` | **Real runs done** (see the status line) |
| `openai-compatible` | OpenAI-compatible (custom) | user-entered | user's choice, default `plain` | Same code path as the presets |

**Answer modes** (`response_format`):
- `json_schema`: send the task schema with `strict: true`.
- `json_object`: JSON mode. The schema is appended to the instruction in text.
- `plain`: no `response_format`. The schema is in the instruction. Works with any server.

**Every mode then runs the same safety net:** tolerant parse → validate against the task schema (`github.com/google/jsonschema-go`, already a dependency) → on failure, **one repair retry** that sends the validation error back and asks for a corrected answer. Two failures → error.

`unavailable()`: missing key (except Ollama), missing model, or for custom a missing base URL.

## 3. Settings

| Field | Default | Notes |
|---|---|---|
| `openaiKey`, `openaiModel` | "", "" | |
| `deepseekKey`, `deepseekModel` | "", "" | |
| `ollamaURL`, `ollamaModel` | `http://localhost:11434/v1`, "" | No key. |
| `customAIBaseURL`, `customAIKey`, `customAIModel` | "" | Key optional. |
| `customAIMode` | `plain` | `json_schema` / `json_object` / `plain`. |

**Model choice:** a **Load models** button calls `GET /models` on that provider (part of the OpenAI format; DeepSeek and Ollama support it) to fill a dropdown, with a free-text box as fallback. This avoids hard-coding model names that go stale. Each block also gets a **Test** button that runs a tiny task and reports the model and time taken.

`gradingProvider` / `tipsProvider` accept the new IDs. Keys stay in settings.json (0600), never in error messages.

## 4. Request details

- OpenAI Go SDK (`github.com/openai/openai-go`) with `option.WithBaseURL` and `option.WithAPIKey`. One SDK retry for transient errors, like Anthropic.
- `system` = task instruction (plus the schema text in `json_object`/`plain` modes), one user message = task input.
- Timeouts and output limits per role, as in `provider_anthropic.go` (grading 5 min / 16000 tokens, tips 60 s / 1024, planning 2 min / 16000).
- Reasoning models: if the response has `reasoning_content` (DeepSeek reasoner), ignore it; only the message content is parsed.
- The reported model is the response's `model` field.
- `json_object` mode: the instruction must contain the word "json" (DeepSeek requires it). An empty answer counts as a bad answer and gets the repair retry (DeepSeek warns its JSON mode "may occasionally return empty content").

**DeepSeek context caching (checked 2026-10-08, [guides/kv_cache](https://api-docs.deepseek.com/guides/kv_cache)):** automatic and on for everyone on the OpenAI-format endpoint, with no request changes needed. A request hits the cache only when it fully matches a stored prefix, so the instruction goes first and stays byte-identical between runs, with the varying input last. Hits are reported in `usage.prompt_cache_hit_tokens` / `prompt_cache_miss_tokens`; log both. The docs call caching "best-effort" with no guaranteed hit rate.

**Open question: which DeepSeek endpoint to use.** DeepSeek also has an Anthropic-compatible endpoint. Its docs list `cache_control` as ignored and say nothing about caching there. A Google AI search summary (2026-10-08, unsourced on this point) says both endpoints share the same automatic prefix cache and leans toward the OpenAI-style endpoint, because the Anthropic one converts the request first and ignores `cache_control`. No source shows the Anthropic endpoint caching more. Our tasks are single requests with a fixed instruction first, so caching should behave the same on either. **Default: the OpenAI-style endpoint.** Supporting evidence that the Anthropic endpoint is a conversion layer with rough edges: deepseek-ai/DeepSeek-V3 [#1369](https://github.com/deepseek-ai/DeepSeek-V3/issues/1369) (a `system` content-block array broke with "unknown variant `system`, expected `user` or `assistant`") and [#1269](https://github.com/deepseek-ai/DeepSeek-V3/issues/1269) (unstable `tool_use` conversion, ignored `cache_control` and `thinking.budget_tokens`). Both were closed as stale ("not planned") with no reply from DeepSeek. Neither shows conversion causing cache misses; that part is still inference. That endpoint supports forced `tool_choice` (`tool`/`any`) with `input_schema`, which would give schema-shaped answers like our Gemini `submit_result`, but it doesn't support `output_config.format`, so the existing Anthropic provider can't be pointed at it unchanged. **Decide by measurement:** send the same grading task 5× through each endpoint with the user's key, and compare cache hits (`usage` fields), cost, and answer validity.

## 5. Errors

| Case | Message |
|---|---|
| 401 / 403 | "<Provider> rejected the API key" |
| 404 on the model | "<Provider> doesn't have the model <name>" |
| 429 | "<Provider> is rate limiting requests", with `retry-after` if sent |
| 402 / insufficient balance | "<Provider> says the account is out of credit" |
| 5xx / connection refused | "<Provider> is unavailable" (Ollama: "Ollama isn't running at <url>") |
| Bad answer twice | "<Provider>'s answer wasn't in the expected format" |

## 6. Testing

- `httptest` fake server per answer mode: request shape (model, `response_format`, schema text in the instruction for non-schema modes), success, fenced and prose-wrapped JSON, invalid answer → repair retry → success, two failures → error, and each error status.
- `GET /models` parsing.
- **Before listing a preset:** a real grading, tip and plan run on a copy of the database. DeepSeek with the user's key; Ollama if installed. The results go in this spec's status line.
- OpenAI stays fake-server-only until a key is available. Record that here, as was done for Anthropic.
