# Resume AI — Phase 0a: AI task settings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the per-feature provider fields with one task registry and an `AIFeatures` map, let a single run override provider/model, and split Settings into AI providers and AI features.

**Architecture:** `settings.AITasks` is the registry; `Settings.AIFeatures[taskID]` holds an `AIChoice{Provider, Model, Effort}`. `ai.RunTask` takes an `AIChoice`, writes its model into a copy of the settings for that provider and its effort into the task. choicegen exports the registry to the frontend; a new `AIFeaturesSection` renders collapsible groups.

**Tech Stack:** Go 1.23, Wails v2, React 19 + TypeScript, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-12-resume-ai-design.md`

## Global Constraints

- Pre-production: remove `GradingProvider`, `TipsProvider`, `PlanProvider`, `MatchProvider`, `AnthropicGradingEffort`, `AnthropicTipsEffort`; no migration.
- Every registry task has a provider after `ApplyDefaults` (default `gemini-live`); effort defaults: `interviewTips` and `resumeImprove` = `low`, every other task = `high`.
- `Save` rejects an unknown task id, provider or effort.
- An empty `Model` means the provider's own model setting.
- `bash tools/verify.sh` green before commit.

## Review Focus

- A settings file holding a task id the registry no longer has: Load must not fail; Save drops unknown ids is NOT allowed silently — Save rejects them, so ApplyDefaults removes ids not in the registry first (loaded files from older builds stay loadable). Test in Task 1.
- An override naming a provider whose model field is empty (OpenAI-style "not chosen yet") with a non-empty override model: the override model is used. Test in Task 2.
- An override with empty Model must leave the provider's configured model untouched. Test in Task 2.
- Mock interview plan override (`InterviewSetup.PlanProvider`) naming a provider other than the setting: the setting's model must NOT be applied to the other provider. Test in Task 3.
- Settings UI: a group whose tasks use a provider that isn't set up shows the warning. Test in Task 4 (pure function).

---

### Task 1: Task registry and AIFeatures in settings

**Files:**
- Create: `internal/settings/aitasks.go`, `internal/settings/aitasks_test.go`
- Modify: `internal/settings/settings.go` (fields, defaults, validation), `internal/settings/settings_test.go`

**Interfaces — Produces:**
```go
type AIChoice struct{ Provider, Model, Effort string } // json: provider, model, effort
type AITask struct{ ID, Group, Label, DefaultEffort string }
type AITaskGroup struct{ ID, Label string }
const TaskInterviewPlan, TaskInterviewTips, TaskInterviewGrading, TaskJobMatch,
      TaskResumeTailor, TaskResumeImprove, TaskResumeReview, TaskResumeImport, TaskLetterDraft
var AITaskGroups []AITaskGroup // interviews, matching, resumes, letters
var AITasks []AITask
func (s Settings) AIChoice(task string) AIChoice
Settings.AIFeatures map[string]AIChoice `json:"aiFeatures"`
```

- [ ] Step 1: tests — defaults fill every task (provider gemini-live, efforts per constraint); unknown task id in a loaded file is dropped by ApplyDefaults; Save rejects bad provider / effort; model is trimmed; `AIChoice` of an unknown task panics-free returns zero value.
- [ ] Step 2: run `go test ./internal/settings/` → FAIL.
- [ ] Step 3: implement; remove old fields, their defaults and validation; replace `validateAIChoices` loop with one over `AIFeatures`.
- [ ] Step 4: `go test ./internal/settings/` → PASS.

### Task 2: RunTask takes an AIChoice

**Files:** Modify `internal/ai/aitask.go`, `provider_anthropic.go`, `provider_openai.go`, `provider_claudecode.go`, `aitest/aitest.go`, provider tests.

**Interfaces — Produces:**
```go
const RoleWriting Role // tailor, review, import, letter
Task.Effort string     // set by RunTask from the choice; anthropic falls back to "high"
func RunTask(ctx, s settings.Settings, c settings.AIChoice, t Task, out any) (model string, err error)
func withModel(s settings.Settings, provider, model string) settings.Settings
```
- [ ] Step 1: tests — `withModel` for each provider id sets that provider's model field and only that; empty model returns s unchanged; anthropic request carries `t.Effort` and the override model; RoleWriting has a timeout and token cap in every provider table (table-driven over `[]Role{...}`).
- [ ] Step 2: run → FAIL. Step 3: implement. Step 4: `go test ./internal/ai/...` → PASS.

### Task 3: Call sites use the registry

**Files:** Modify `internal/app/interviews_ai.go`, `interview_plan.go`, `match_run.go`, `aitask_tasks.go` users, tests that set `s.PlanProvider` etc.

- Tips: `s.AIChoice(settings.TaskInterviewTips)`; grading: `TaskInterviewGrading`; match: `TaskJobMatch`; plan: `planChoice(s, setup)` = setting's choice, or `{Provider: setup.PlanProvider}` with the setting's effort when the override names a different provider.
- Records keep `choice.Provider` where they stored the provider id.
- [ ] Step 1: update tests to set `s.AIFeatures[...]`; add `TestPlanOverrideDropsSettingModel`.
- [ ] Step 2–4: run `go test ./internal/app/` FAIL → implement → PASS.

### Task 4: choicegen and Settings UI

**Files:**
- Modify: `internal/choicegen/choicegen.go` (+test) — emit `AI_TASK_GROUPS` and `AI_TASKS` (`{ id, group, label }`).
- Create: `frontend/src/pages/Settings/AIFeaturesSection.tsx`, `frontend/src/pages/Settings/aiFeatures.ts`, `aiFeatures.test.ts`
- Modify: `AIProvidersSection.tsx` (remove who-does-what, effort selects), `JobMatchingSection.tsx` (provider from `aiFeatures.jobMatch`), `providerGroups.ts` (+test: in-use providers from `aiFeatures`), `lib/settingsNav.ts` (+`features` section "AI features"), `SettingsPage.tsx`, `components/interview/InterviewSetupModal.tsx` (default label from `aiFeatures.interviewPlan`).

**Interfaces — Produces (frontend):**
```ts
export function groupSummary(s: settings.Settings, group: string, providers: ai.AIProvider[]): { count: number; providers: string; problems: string[] }
export function setGroupProvider(s: settings.Settings, group: string, provider: string): settings.Settings
export function setTaskChoice(s: settings.Settings, task: string, patch: Partial<settings.AIChoice>): settings.Settings
```
- [ ] Step 1: Vitest — summary lists distinct provider labels in task order with model when overridden; `problems` names tasks whose provider has `unavailable`; `setGroupProvider` changes only that group's tasks and clears their model overrides.
- [ ] Step 2–4: FAIL → implement section (collapsible cards, expansion remembered in localStorage under `jobtrack.aiFeatures.open`, try/catch) → PASS.
- [ ] Step 5: `bash tools/verify.sh` → green; commit "settings: AI features, one provider choice per task".
