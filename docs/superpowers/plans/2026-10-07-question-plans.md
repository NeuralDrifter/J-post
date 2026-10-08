# Interview Question Plans Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A chosen AI provider writes a question plan before each mock interview. The plan steers the Gemini Live interviewer and becomes the grading checklist. Interviews can be retried with the same plan, and the attempts are compared.

**Architecture:**
- **Making the plan:** a new `interviewPlan` aiTask is run through `runAITask` inside `prepareInterview`, before the Live token is created.
- **Steering Gemini:** the plan is written into the interviewer brief, alongside stronger general rules that apply to every interview.
- **Storage:** plans live in a new `interview_plans` table. Interviews point at their plan via `plan_id`, and the attempts are the interviews sharing a `plan_id`.
- **Grading:** grading receives the plan, and each question review gains an optional `planIndex` so attempts can be compared question by question.

**Tech Stack:** Go 1.26, Wails v2, modernc SQLite (append-only migrations), React + TypeScript, vitest.

**Spec:** `docs/superpowers/specs/2026-10-07-question-plans-design.md`

Per project memory, this plan lists the tasks, interfaces and tests and does not embed full source. The executor writes the code, test first.

## Global Constraints

- Gemini calls go through the Live endpoint only; structured output via the `submit_result` tool call (`liveStructured`).
- The Claude Code MCP server exists only for the headless run (no change here, just don't add a permanent one).
- Migrations are append-only: add migration 9 at the end of `migrations` in `db.go`; never edit migrations 1–8.
- Never run `wails generate module`, `wails build` or `wails dev` without `JOBTRACK_DATA_DIR` pointing at a scratch folder (they open the real `~/.jobtrack` database).
- Core question count: `max(2, minutes/5)`. Validation accepts that count ±1, and at least 1.
- Time limits for `rolePlanning`: Claude Code 3 min, Anthropic API 2 min. Anthropic effort reuses `AnthropicGradingEffort`; max tokens the same as grading (16000).
- `InterviewSetup.PlanProvider`: `""` means use the setting, `"none"` means no plan, anything else is a provider id. `InterviewSetup.RetryOf`: an interview id.
- Retry refusal message: "This interview has no question plan to retry."
- Settings note: "Gemini Live is fastest; Claude Code and the Anthropic API usually write deeper questions but take up to a minute."
- No AI attribution trailers in commits; AI help is credited by model name on the licenses page (`BUILT_WITH`) and in the README Credits.
- Test commands:
  - Go: `go test ./...` from the repo root.
  - Frontend: `npx vitest run` and `npx tsc --noEmit` from `frontend/`.

## Review Focus

1. **The grader returns a `planIndex` that is out of range or negative.** The comparison must treat that review as off-plan, not crash or misfile it. Pinned in Task 7 (`compareAttempts` test).
2. **A retry request carries a different kind or minutes than the original.** The backend must use the original's kind and minutes and ignore the client's. Pinned in Task 5.
3. **Interviews from before migration 9** (`plan_id = ''`) must load with no plan, attempt 0, no Retry action and no comparison. Pinned in Task 3 and Task 9.
4. **Deleting a job** cascades to its plans as well as its interviews, so no orphan plans are left. Pinned in Task 3.
5. **The candidate edits a stored plan file by hand / the DB holds bad plan JSON.** The interview still loads, with `planError` set, and the Interviews list is unaffected. Pinned in Task 3.

---

### Task 1: The plan task, its schema, validation and the planning role

**Files:**
- Create: `interview_plan.go` (types, schema, instruction, task builder, validation, brief section, prompt section)
- Modify: `aitask.go` (add `rolePlanning`)
- Modify: `provider_anthropic.go` (`anthropicMaxTokens`, `anthropicTimeout` entries for `rolePlanning`)
- Modify: `provider_claudecode.go` (`claudeCodeTimeout` entry for `rolePlanning`)
- Test: `interview_plan_test.go`, `aitask_test.go` (schema list)

**Interfaces:**
- Produces:
  - `type PlannedQuestion struct { Question, Tests string; Minutes int; Probes, StrongAnswer []string }` with JSON tags `question, tests, minutes, probes, strongAnswer`.
  - `type ResumeClaim struct { Claim, Probe string }` with JSON tags `claim, probe`.
  - `type InterviewPlan struct { Questions []PlannedQuestion; ResumeClaims []ResumeClaim }` with JSON tags `questions, resumeClaims`.
  - `func planQuestionCount(minutes int) int`, which returns `max(2, minutes/5)`.
  - `var planSchema map[string]any`, standard JSON Schema; all fields required, with `resumeClaims` allowed to be empty.
  - `func planTask(job Job, resume string, s InterviewSetup) aiTask`. Its name is `"interviewPlan"` and its role is `rolePlanning`. The input contains the job description, the resume (or "(no resume provided)"), the kind's `briefName`, the persona and its `briefStyle`, the minutes, the focus and the exact question count.
  - `func (p InterviewPlan) validate(minutes int) error`. It fails when the count is outside `planQuestionCount(minutes)±1` or is 0, or when any question has an empty `Question`, no probes or no strong-answer points. The error text says what is wrong, e.g. `"the plan has 1 questions; expected about 5"`.
  - `const rolePlanning aiRole`, added after `roleTips`.

- [ ] **Step 1: Write the failing tests** in `interview_plan_test.go`:
  - `TestPlanQuestionCount`: 10→2, 15→3, 25→5, 45→9.
  - `TestPlanTaskInput`: for a job with description "Build APIs", resume "Jane, Go", a behavioral setup with 25 min and focus "conflict", the input contains all of those, plus "5" questions and the persona style. The name is `interviewPlan` and the role is `rolePlanning`.
  - `TestPlanValidate`: table test covering:
    - a valid plan for 25 min (5 questions)
    - 4 and 6 questions accepted
    - 3 rejected
    - 0 rejected
    - a question with no probes rejected
    - one with no strong-answer points rejected
    - one with blank question text rejected
  - In `aitask_test.go`, add `planSchema` to the list `TestTaskSchemasAreStandardJSONSchema` checks.
  - `TestPlanningRoleLimits`: `claudeCodeTimeout[rolePlanning] == 3*time.Minute`, `anthropicTimeout[rolePlanning] == 2*time.Minute` and `anthropicMaxTokens[rolePlanning] == 16000`.
- [ ] **Step 2: Run** `go test ./... -run "Plan|TaskSchemas"`. Expected: FAIL (undefined `planQuestionCount`, `planTask`, …).
- [ ] **Step 3: Implement** `interview_plan.go` and the role map entries.
  - The instruction (`planInstruction`) tells the model that it is an experienced hiring manager preparing private notes for a realistic interview of this kind. It must:
    - write exactly N core questions grounded in the JD and the resume, ordered as a real interview would flow
    - give per-question minutes summing to about the interview length minus about 3 minutes for greeting and wrap-up
    - give 2–3 probes per question that dig into personal contribution, trade-offs and measurable results
    - give 3–5 concrete strong-answer points per question
    - give 2–4 resume claims worth testing, each with a probe (empty when there's no resume)
  - In `provider_anthropic.go`, check that only `roleTips` uses `AnthropicTipsEffort`. Planning must fall through to grading effort.
- [ ] **Step 4: Run** `go test ./...`. Expected: PASS.
- [ ] **Step 5: Add provider coverage tests** (each runs `planTask` end to end through an existing fake, with `var p InterviewPlan`; the result must decode and `p.validate(25) == nil`):
  - `TestPlanThroughGeminiLive`: `fakeLiveServer` + `replyWithToolCall` with a 5-question plan map.
  - `TestPlanThroughAnthropic`: `fakeAnthropic` + `anthropicReply` with the plan JSON. Also assert that the request's effort equals the grading effort.
  - `TestPlanThroughClaudeCode`: the fake CLI's `ok` mode submits a nudge, so add a `plan` mode to `testdata/fakeclaude/main.go` that submits a valid 5-question plan, and use `useFakeClaude(t, "plan")`.

  Run `go test ./... -run PlanThrough`. Expected: PASS. If one fails, fix the provider, not the test.
- [ ] **Step 6: Commit** `feat: interview plan task, schema and validation`.

### Task 2: The question plan provider setting

**Files:**
- Modify: `settings.go`
- Test: `settings_test.go`

**Interfaces:**
- Produces: `Settings.PlanProvider string` with JSON tag `planProvider`. It defaults to `providerGeminiLive` in `applySettingsDefaults` and is validated with the same loop as `GradingProvider`/`TipsProvider` (`settings.go:141`).

- [ ] **Step 1: Write failing tests:**
  - `TestPlanProviderDefaultsToGeminiLive` covers a fresh load.
  - `TestPlanProviderMustBeKnown` checks that saving `"nope"` fails with the same error shape as an unknown grading provider.
- [ ] **Step 2: Run** `go test ./... -run PlanProvider`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `go test ./...`. Expected: PASS.
- [ ] **Step 5: Commit** `feat: question plan provider setting`.

### Task 3: Migration 9, plan storage, attempts and deletion

**Files:**
- Modify: `db.go` (migration 9 from the spec, verbatim)
- Create: `plans.go` (storage)
- Modify: `interviews_ai.go`:
  - `MockInterview` fields
  - `mockColumns`/`scanMock` (add `m.plan_id`)
  - `CreateMockInterview` (takes the plan id)
  - `DeleteMockInterview` (plan cleanup in a transaction)
  - `GetMockInterview`/`ListMockInterviews` (call `loadPlanData`)
- Modify: `scorecards.go` (`MockInterviewSummary.HasPlan`, `.Attempt`; summary query)
- Test: `plans_test.go`, `db_test.go`

**Interfaces:**
- Produces:
  - `type InterviewPlanRecord struct { ID, Provider, Model, CreatedAt string; Plan InterviewPlan }` with JSON tags `id, provider, model, createdAt, plan`.
  - `type AttemptSummary struct { ID, StartedAt string; Overall *ScoreSet }` with JSON tags `id, startedAt, overall,omitempty`.
  - `MockInterview` gains:
    - `PlanID string` (`planId`)
    - `Plan *InterviewPlanRecord` (`plan,omitempty`)
    - `PlanError string` (`planError`)
    - `Attempt int` (`attempt`; 0 when no plan, else 1-based)
    - `Attempts []AttemptSummary` (`attempts`; empty slice when there is no plan, oldest first)
  - `MockInterviewSummary` gains `HasPlan bool` (`hasPlan`) and `Attempt int` (`attempt`).
  - `func (r *Repo) savePlan(jobID string, s InterviewSetup, provider, model string, p InterviewPlan) (string, error)` returns the new plan id.
  - `func (r *Repo) planFor(interviewID string) (InterviewPlanRecord, error)`. It returns `ErrNotFound` (wrapped) when the interview has no plan.
  - `func (r *Repo) loadPlanData(m *MockInterview) error` fills `Plan`/`PlanError`/`Attempt`/`Attempts`. A plan JSON that can't be parsed sets `PlanError` and returns nil.
  - `CreateMockInterview(jobID string, s InterviewSetup, planID string) (MockInterview, error)`. Update the existing callers.
  - `func (r *Repo) ListPlanAttempts(id string) ([]MockInterview, error)` returns every attempt sharing `id`'s plan, oldest first, each with review data loaded. For an interview without a plan it returns just that interview.

- [ ] **Step 1: Write failing tests:**
  - `TestMigration9KeepsV8Data` in `db_test.go`. Build a v8 database with raw SQL (open with `migrations[:8]`, insert a job and a mock interview with a scorecard, close it), then reopen with all migrations. The interview loads with `PlanID == ""`, `Plan == nil`, `Attempt == 0`, its scorecard is intact, and `ListAllMockInterviews` shows `HasPlan == false`, `Attempt == 0`.
  - `TestPlanStorageAndAttempts`: save a plan, create three interviews with it at increasing times (`setNow`), plus one without a plan. Check:
    - the middle one has `Attempt == 2` and 3 `Attempts` in order
    - its `Plan.Plan` round-trips
    - the summary rows show `Attempt` 1, 2, 3 and `HasPlan`
    - the planless one has `Attempt == 0` and empty `Attempts`
  - `TestAttemptOverallUsesNewestScorecard`: an attempt with two scorecards reports the newer card's overall.
  - `TestDeletingAttemptsKeepsPlanUntilLast`: deleting one of two attempts keeps the plan row; deleting the last removes it (count rows in `interview_plans`).
  - `TestDeletingJobRemovesPlans`: delete the job and `interview_plans` is empty.
  - `TestUnreadablePlanDoesNotBreakLoading`: `UPDATE interview_plans SET plan = 'not json'`. Then `GetMockInterview` succeeds with `PlanError != ""` and `Plan == nil`, and `ListAllMockInterviews` succeeds.
  - `TestListPlanAttempts`: returns the attempts oldest first with their scorecards; returns just itself for a planless interview.
- [ ] **Step 2: Run** `go test ./... -run "Migration9|Plan|Attempt|DeletingJob"`. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - Attempt numbering is one query: `SELECT id, started_at FROM mock_interviews WHERE plan_id = ? ORDER BY started_at, rowid`.
  - The summary's `Attempt` is computed in Go from the already-loaded list, grouped by `plan_id`. Add `m.plan_id` to the summary query and an unexported field to carry it.
  - `DeleteMockInterview`:
    - Read `plan_id`.
    - In one transaction, delete the interview, then `DELETE FROM interview_plans WHERE id = ? AND NOT EXISTS (SELECT 1 FROM mock_interviews WHERE plan_id = ?)`.
    - Then remove the recording file as now.
- [ ] **Step 4: Run** `go test ./...`. Expected: PASS.
- [ ] **Step 5: Commit** `feat: store question plans and link attempts`.

### Task 4: Stronger interviewer rules, the plan in the brief, and the wrap-up cue

**Files:**
- Modify: `interviews_ai.go` (`buildInterviewBrief`, `liveCues`)
- Modify: `interview_plan.go` (`func (p InterviewPlan) briefSection() string`)
- Test: `interviews_ai_test.go`, `interview_plan_test.go`

**Interfaces:**
- Consumes: `InterviewPlan` (Task 1).
- Produces:
  - `buildInterviewBrief(job Job, contacts []Contact, resume string, s InterviewSetup, plan *InterviewPlan) string`.
  - `liveCues(minutes int, hasPlan bool) LiveCues`.
  - `func (p InterviewPlan) briefSection() string`.

- [ ] **Step 1: Write failing tests:**
  - `TestBriefHasDepthRules`: the brief without a plan contains the five rules from the spec. Assert the key phrases "personally", "numbers", "baseline", "rehearsed" and "One topic at a time".
  - `TestBriefWithPlan`: with a 2-question plan and one resume claim, the brief contains:
    - "Your interview plan"
    - both questions in order (index of q1 < index of q2)
    - each probe and strong-answer point
    - the claim
    - the minutes
    - a "never read" / "never hint" instruction
    - "Cover every core question"
  - `TestBriefWithoutPlanHasNoPlanSection`: no "Your interview plan".
  - `TestWrapUpCueMentionsPlan`: `liveCues(25, true).WrapUp` contains "core question"; `liveCues(25, false).WrapUp` doesn't. All other fields are equal between the two.
  - Update existing callers and tests (`TestBriefContents`, `TestLiveCuesTiming`, `TestPrepareInterview`'s `liveCues(25)`) to the new signatures with `nil` / `false`.
- [ ] **Step 2: Run** `go test ./... -run "Brief|Cue"`. Expected: FAIL (compile errors count as the expected failure here, because the signatures change).
- [ ] **Step 3: Implement.** The plan section goes after "How to run it" and before the job description. It is phrased as the interviewer's private notes, with the rules from spec §2.
- [ ] **Step 4: Run** `go test ./...`. Expected: PASS.
- [ ] **Step 5: Commit** `feat: deeper interviewer rules and the plan in the brief`.

### Task 5: Make, reuse or skip the plan when an interview starts

**Files:**
- Modify: `interviews_ai.go` (`InterviewSetup`, `validateInterviewSetup`, `prepareInterview`)
- Test: `interviews_ai_test.go`

**Interfaces:**
- Consumes:
  - `planTask`, `InterviewPlan.validate` (Task 1)
  - `Settings.PlanProvider` (Task 2)
  - `savePlan`, `planFor`, `CreateMockInterview(…, planID)` (Task 3)
  - `buildInterviewBrief(…, plan)`, `liveCues(minutes, hasPlan)` (Task 4)
- Produces:
  - `InterviewSetup.PlanProvider string` (`planProvider`) and `InterviewSetup.RetryOf string` (`retryOf`).
  - `const planNone = "none"`.
  - `errNoPlanToRetry = errors.New("This interview has no question plan to retry.")`.
  - `prepareInterview` keeps its signature and uses the order from spec §1.

- [ ] **Step 1: Write failing tests** (all use `withGeminiServer` for the token, as `TestPrepareInterview` does). Assert brief contents through the captured `bidiGenerateContentSetup`.
  - `TestPrepareInterviewMakesPlanWithSettingProvider`:
    - `s.PlanProvider = providerAnthropic` with `fakeAnthropic` returning a valid 5-question plan.
    - The stored interview has a `Plan` with `Provider == "anthropic"` and the reply's model.
    - The brief contains plan question 1.
    - `live.Cues == liveCues(25, true)`.
  - `TestPrepareInterviewPlanProviderOverride`: the setting is gemini-live but `setup.PlanProvider = providerAnthropic`. Anthropic is called, and no Live socket is opened for planning (the `fakeLiveServer` handler fails the test if hit).
  - `TestPrepareInterviewPlanFailureCreatesNothing`:
    - `fakeAnthropic` returns 500.
    - The error is returned and `ListAllMockInterviews` is empty.
    - `interview_plans` is empty and the token endpoint was not called.
  - `TestPrepareInterviewInvalidPlanFails`: the provider returns a plan with 1 question for 25 min. The error mentions the count, and no record is created.
  - `TestPrepareInterviewWithoutPlan`: `PlanProvider = planNone`. No AI call, `Plan == nil`, the brief has no plan section, and the cues come from `liveCues(25, false)`.
  - `TestRetryReusesPlanAndOriginalShape`:
    - Create an original with a plan (kind behavioral, 25 min).
    - Retry with `RetryOf = original.ID`, but send `Kind: "technical"`, `Minutes: 45` and persona "tough".
    - The new interview has the same `PlanID`, kind behavioral, 25 min and persona "tough", with `Attempt == 2`.
    - No planning call is made (the fakes fail if hit).
  - `TestRetryWithoutPlanIsRefused`: the original was made with `planNone`. The retry returns `errNoPlanToRetry` and creates no record.
  - `TestRetryOfMissingInterview`: `RetryOf = "nope"` returns an error wrapping `ErrNotFound`.
- [ ] **Step 2: Run** `go test ./... -run "PrepareInterview|Retry"`. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - The retry branch loads the original (`GetMockInterview`), copies its `Kind`/`Minutes`, and checks `PlanID != ""` and `Plan != nil` (refuse when `PlanError` is set, using the same refusal message). Then it validates and reuses the plan.
  - The planning branch resolves the provider: `setup.PlanProvider` or else `s.PlanProvider`.
  - Planning runs with `runAITask(ctx, s, provider, planTask(job, profile.ResumeText, setup), &plan)`, then `plan.validate(setup.Minutes)`, then `savePlan` only after the token succeeds. Ruling-worthy detail: save the plan and create the interview after `createLiveToken` succeeds, so a token failure leaves nothing behind. The existing `markFailed` path on token failure then goes away, because the record doesn't exist yet. Keep or adjust the existing test that covers it, and ledger the ruling.
- [ ] **Step 4: Run** `go test ./...`. Expected: PASS.
- [ ] **Step 5: Commit** `feat: make or reuse a question plan when an interview starts`.

### Task 6: Grading against the plan

**Files:**
- Modify: `interviews_ai.go` (`QuestionReview.PlanIndex`)
- Modify: `aitask_tasks.go` (`scorecardSchema` gains an optional `planIndex` integer on question items, not in `required`; `scoringInstruction` gains the plan rules; `scoringPrompt` includes the plan)
- Modify: `interview_plan.go` (`func (p InterviewPlan) gradingSection() string`)
- Test: `interviews_ai_test.go`, `aitask_test.go`

**Interfaces:**
- Consumes: `MockInterview.Plan` (Task 3).
- Produces:
  - `QuestionReview.PlanIndex *int` with JSON tag `planIndex,omitempty`.
  - `scoringPrompt(job Job, mi MockInterview, resume string) string`, unchanged signature; it reads `mi.Plan`.

- [ ] **Step 1: Write failing tests:**
  - `TestScoringPromptIncludesPlan`: for an interview with a 2-question plan, the prompt contains each question, its strong-answer points, the resume claim, and the numbered indexes "0" and "1" next to the questions.
  - `TestScoringPromptWithoutPlan`: no plan section.
  - `TestScoringInstructionCoversPlan`: it contains "strong", "planIndex" and the rule that skipped core questions don't lower the scores ("not the candidate's").
  - `TestPlanIndexRoundTrips`: a scorecard with `planIndex: 0` on one review and none on another unmarshals with a non-nil `0` and a `nil`, and marshals back without `planIndex` for the nil one.
  - `TestGeminiSchemaConversion` still passes with the optional integer (add an assertion that `planIndex` converts to Gemini's `INTEGER`).
- [ ] **Step 2: Run** `go test ./... -run "Scoring|PlanIndex|GeminiSchema"`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `go test ./...`. Expected: PASS.
- [ ] **Step 5: Commit** `feat: grade answers against the question plan`.

### Task 7: Bindings and frontend helpers

**Files:**
- Modify: `app.go` (binding `ListPlanAttempts(id string) ([]MockInterview, error)`)
- Regenerate: `frontend/wailsjs/**` via `JOBTRACK_DATA_DIR=<scratch> wails generate module`
- Create: `frontend/src/lib/plans.ts`, `frontend/src/lib/plans.test.ts`
- Modify: `frontend/src/lib/backend.ts` if it re-exports bindings by name (add `ListPlanAttempts`)

**Interfaces:**
- Consumes: the Go types from Tasks 3 and 6, through the generated `main.*` classes.
- Produces (in `lib/plans.ts`):
  - `attemptLabel(attempt: number, total: number): string`. It returns `"Attempt 2 of 3"`, or `""` when `attempt === 0` or `total < 2`.
  - `canRetry(mi: { planId: string; planError: string }): boolean`.
  - `compareAttempts(plan: main.InterviewPlan, attempts: main.MockInterview[])`. It returns `{ questions: { question: string; byAttempt: { attemptId: string; answerSummary: string; improve: string }[] }[]; other: { attemptId: string; reviews: main.QuestionReview[] }[] }`, using each attempt's newest scorecard (`scorecards[0]`). A review whose `planIndex` is missing, negative or ≥ the number of questions goes to `other`. Attempts with no scorecard contribute nothing.

- [ ] **Step 1: Add the binding** and regenerate:
  - `mkdir -p "$TEMP/jt-scratch"`, then `JOBTRACK_DATA_DIR="$TEMP/jt-scratch" wails generate module`.
  - Confirm that `git diff --stat frontend/wailsjs` shows the new fields (`planId`, `plan`, `attempts`, `planIndex`, `planProvider`, `retryOf`, `hasPlan`).
  - Confirm `~/.jobtrack/jobtrack.db` has an unchanged modification time.
- [ ] **Step 2: Write failing tests** in `plans.test.ts`:
  - `attemptLabel`: (2,3)→"Attempt 2 of 3", (1,1)→"" and (0,0)→"".
  - `canRetry`: false for an empty `planId` or a set `planError`.
  - `compareAttempts`, using two attempts and a 2-question plan:
    - Groups by `planIndex`, in plan order and in attempt order.
    - `planIndex: 5` and `planIndex: -1` go to `other`.
    - A review without `planIndex` goes to `other`.
    - An attempt with no scorecards is skipped without throwing.
- [ ] **Step 3: Run** `npx vitest run src/lib/plans.test.ts` in `frontend/`. Expected: FAIL (module not found).
- [ ] **Step 4: Implement** `plans.ts`.
- [ ] **Step 5: Run** `npx vitest run` and `npx tsc --noEmit`. Expected: PASS. Also run `go test ./...`. Expected: PASS.
- [ ] **Step 6: Commit** `feat: plan bindings and attempt comparison helpers`.

### Task 8: Settings row and the setup modal (planner, preparing, failure, retry)

**Files:**
- Modify: `frontend/src/pages/Settings/AIProvidersSection.tsx` (a third provider row bound to `planProvider`, with the Global Constraints note)
- Modify: `frontend/src/components/interview/InterviewSetupModal.tsx`
- Create: `frontend/src/components/interview/setupState.ts` + `setupState.test.ts` (pure helpers, so the modal's logic is testable without rendering)

**Interfaces:**
- Consumes:
  - `ListAIProviders`, `PrepareInterview`, `GetSettings`
  - `main.InterviewSetup.planProvider` / `.retryOf`
- Produces:
  - `InterviewSetupModal({ job, onClose, retry }: { job: main.Job; onClose: () => void; retry?: { id: string; kind: string; minutes: number; startedAt: string } })`.
  - In `setupState.ts`:
    - `initialSetup(job: main.Job, retry?: RetryInfo): main.InterviewSetup`. With `retry`, `kind`/`minutes` come from it and `retryOf` is set.
    - `preparingLabel(providerLabel: string, retry: boolean): string`. It returns `"Preparing your questions with Claude Code…"`, or `"Starting…"` for a retry.

- [ ] **Step 1: Write failing tests** in `setupState.test.ts`:
  - `initialSetup` without retry keeps today's defaults: `kind` behavioral when the job is interviewing, else phone_screen; 25 min; and `planProvider: ''`.
  - With retry, `kind`/`minutes`/`retryOf` come from the retry info.
  - `preparingLabel` returns both strings.
- [ ] **Step 2: Run** `npx vitest run src/components/interview/setupState.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** the helpers, then the modal:
  - **Planner dropdown** ("Questions planned by"): options from `ListAIProviders`. Unavailable providers are disabled with their reason, and the first option is "Default (<setting's provider label>)" with value `''`. It is hidden in retry mode.
  - **In retry mode:**
    - The header reads "Retry: same questions as the interview on <formatDate(startedAt)>".
    - The type and length selects are disabled.
  - **While starting:** the button shows `preparingLabel(...)` with a spinning `LoaderCircle`, and the modal stays open.
  - **On failure:** use the non-toasting call pattern (`apiResult`/try-catch, whatever `lib/api.ts` offers for a caught error message; if it only toasts, add a `apiCatch` helper returning `{ ok, error }` and ledger it). The modal shows the error in a danger box with:
    - **Try again**, which resubmits
    - the dropdown, still enabled
    - **Start without a plan**, which resubmits with `planProvider: 'none'`; not shown in retry mode
  - **Settings:** add the third row in `AIProvidersSection.tsx`, matching the existing two rows' markup.
- [ ] **Step 4: Run** `npx vitest run` and `npx tsc --noEmit`. Expected: PASS.
- [ ] **Step 5: Commit** `feat: choose the question planner and retry from the setup modal`.

### Task 9: Review page (Plan tab, attempts, comparison, Retry) and Interviews page

**Files:**
- Create: `frontend/src/pages/Interview/PlanParts.tsx` (`PlanView`, `AttemptsStrip`, `CompareAttempts`)
- Create: `frontend/src/pages/Interview/PlanParts.test.ts` (renderToStaticMarkup, like `ReviewParts.test.ts`)
- Modify: `frontend/src/pages/Interview/InterviewReviewPage.tsx`
- Modify: `frontend/src/pages/Interview/ReviewParts.tsx` (`ScorecardTabs` gains an optional trailing "Plan" tab)
- Modify: `frontend/src/pages/Interviews/InterviewsPage.tsx`

**Interfaces:**
- Consumes:
  - `attemptLabel`, `canRetry`, `compareAttempts` (Task 7)
  - `InterviewSetupModal` with `retry` (Task 8)
  - `ListPlanAttempts`, `GetJob`
- Produces:
  - `PlanView({ record, providers }: { record: main.InterviewPlanRecord; providers?: main.AIProvider[] })`
  - `AttemptsStrip({ current, attempts, onOpen }: { current: string; attempts: main.AttemptSummary[]; onOpen: (id: string) => void })`
  - `CompareAttempts({ plan, attempts }: { plan: main.InterviewPlan; attempts: main.MockInterview[] })`

- [ ] **Step 1: Write failing tests** in `PlanParts.test.ts`:
  - `PlanView` renders every question, probe, strong point and claim, plus "Planned by Claude Code · claude-opus-5-5".
  - `AttemptsStrip` renders "Attempt 2 of 3" and one chip per attempt with its average score, or "—" when unscored. It renders nothing for a single attempt.
  - `CompareAttempts` renders a row per attempt with the five dimension scores, each planned question with every attempt's answer summary, and an "Other questions" section only when there are unmatched reviews.
- [ ] **Step 2: Run** `npx vitest run src/pages/Interview/PlanParts.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** the components, then wire them in:
  - **Review page:**
    - **Tabs:** `ScorecardTabs` gets `extraTab?: { id: 'plan'; label: 'Plan' }`, and `selected === 'plan'` shows `PlanView`. When there are no scorecards but there is a plan, the Plan tab still shows.
    - **Comparison:** `AttemptsStrip` goes under the header when `mi.attempts.length > 1`. A `CompareAttempts` panel appears when there is more than one attempt, loading attempts with `ListPlanAttempts(id)`.
    - **Retry these questions:** a header button when `canRetry(mi)`. It loads the job with `GetJob(mi.jobId)` and opens `InterviewSetupModal` with `retry`.
    - **Plan error:** when `mi.planError` is set, show "The question plan for this interview couldn't be read." as a muted line.
  - **Interviews page:**
    - An "Attempt N" chip when `m.attempt > 1`.
    - A `ListChecks` icon when `m.hasPlan`.
    - A "Retry these questions" context-menu item when `m.hasPlan`. It needs the job, so it loads it with `GetJob(m.jobId)` and opens the modal with `{ id, kind, minutes, startedAt }`.
- [ ] **Step 4: Run** `npx vitest run` and `npx tsc --noEmit` in `frontend/`, and `go test ./...` at the root. Expected: PASS.
- [ ] **Step 5: Commit** `feat: plan tab, attempts and comparison on the review page`.

### Task 10: Live check and docs

**Files:**
- Modify: `docs/superpowers/specs/2026-10-07-question-plans-design.md` (Status: Implemented, plus any deviations from ledgered rulings)

- [ ] **Step 1: Prepare the scratch data folder.**
  - Build with `JOBTRACK_DATA_DIR="$TEMP/jt-live"` (`wails build`).
  - Copy the real `settings.json` there for the keys, and only the settings: copying the database would migrate a copy, which is fine; never touch the original.
  - Record the real DB's modification time before and after.
- [ ] **Step 2: Run the live check.** Run the built exe with that env.
  1. Create a job.
  2. Start a 10-minute interview planned by Claude Code, and check that the "Preparing your questions…" state shows.
  3. Hold a short interview; the interviewer should ask the planned questions with follow-ups.
  4. End it and grade it; the Plan tab and `planIndex`-matched comparison data should appear.
  5. Use **Retry these questions**; attempt 2 should start with no planning wait.
  6. Grade it; the attempts strip and comparison should show both attempts.

  Report what was observed. The user takes part in the voice portion. If they're not available, stop after step 2 and say so.
- [ ] **Step 3: Update the spec status** and commit `docs: question plans implemented`.
