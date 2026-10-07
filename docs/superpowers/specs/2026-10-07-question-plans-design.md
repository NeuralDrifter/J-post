# Interview question plans — design

Status: Approved (brainstorming), awaiting spec review
Branch: feature/question-plans (from main at 24a9543)

## Why

Grading a real mock interview with Claude Code showed the Gemini Live interviewer
rarely asks strong questions or goes deep enough: its brief has general rules but
no plan. This feature (1) strengthens the interviewer's general rules and (2) has
a chosen AI provider write a question plan before each interview, which steers the
interviewer and becomes the grading checklist. Retrying an interview with the same
plan lets the candidate practise the same questions until the delivery is solid,
and compare attempts.

## Decisions (from brainstorming)

| Topic | Decision |
|---|---|
| Plan contents | Core questions, follow-up probes per question, what a strong answer covers, resume claims to verify |
| Visibility | Hidden from the candidate until the review page |
| Timing | A fresh plan each new interview, made when Start is pressed |
| Retry | Any interview with a plan can be retried with the same plan |
| Attempts | Interviews sharing a plan are linked as attempts and compared |
| Planner | "Question plan provider" setting (default Gemini Live), overridable per interview at setup |
| Steering approach | Plan in the interviewer's system instruction (approach A); no mid-session question tracking |

Constraints carried from earlier work: Gemini calls go through the Live endpoint
only (structured output via the `submit_result` tool call); the Claude Code MCP
server exists only for the headless run; never point `wails generate/build/dev`
at the real `~/.jobtrack` (use `JOBTRACK_DATA_DIR`).

## 1. The plan, how it's made and where it's kept

### Plan task

A new AI task `interviewPlan` (in `aitask_tasks.go`) with a JSON Schema, run with
`runAITask` on the chosen provider, like grading and tips.

```
InterviewPlan {
  questions: [{
    question:     string    // the core question
    tests:        string    // what it tests
    minutes:      int       // rough time budget
    probes:       [string]  // 2–3 follow-up probes
    strongAnswer: [string]  // points a strong answer covers
  }]
  resumeClaims: [{
    claim: string           // a specific claim from the resume
    probe: string           // how to test it
  }]
}
```

- Core question count: `max(2, minutes/5)`. The instruction states the exact
  count, and validation accepts that count ±1.
- Inputs: job description, resume, the interview type's brief, the persona, the
  length and the optional focus. These are the same inputs `buildInterviewBrief` uses.
- Go validation after the provider returns: the question count is within ±1 of the
  target (and at least 1); every question
  has a non-empty question, at least one probe and at least one strong-answer point.
- New role `rolePlanning` with time limits of 3 min (Claude Code) and 2 min
  (Anthropic API). Anthropic effort reuses `AnthropicGradingEffort`; max tokens as
  for grading.

### When it's made

Inside `prepareInterview`, before the Live token is created, because the token
locks in the setup message, which includes the brief. Order:

1. validate the setup
2. load the job, contacts and profile
3. make the plan (or reuse it, for a retry)
4. build the brief
5. create the interview record
6. create the token

A planning failure returns the provider's error with no interview record created.

### Provider choice

- Setting `PlanProvider` (default `gemini-live`), validated like
  `GradingProvider`/`TipsProvider`.
- `InterviewSetup.PlanProvider`: `""` uses the setting, otherwise a provider id.
  The special value `"none"` means start without a plan.
- `InterviewSetup.RetryOf`: an interview id. It reuses that interview's plan, kind
  and minutes; no AI call. It fails with a clear error if that interview has no plan.

### Storage (migration 9)

```sql
CREATE TABLE interview_plans (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  minutes INTEGER NOT NULL,
  provider TEXT NOT NULL,
  model TEXT NOT NULL DEFAULT '',
  plan TEXT NOT NULL,          -- InterviewPlan JSON
  created_at TEXT NOT NULL
);
ALTER TABLE mock_interviews ADD COLUMN plan_id TEXT NOT NULL DEFAULT '';
```

- Attempts are the interviews with the same non-empty `plan_id`, ordered by
  `started_at, rowid`. Attempt N of M is computed when the interview is loaded.
- Deleting an interview deletes its plan when no other interview uses it, in the
  same transaction.

## 2. How the plan steers Gemini, and how grading uses it

### Stronger general rules (always)

Added to "How to run it" in `buildInterviewBrief`:

- **Go deep before moving on.** After each answer, ask at least one follow-up that
  digs into their part: what they personally did, why that approach over the
  alternatives, what they'd do differently.
- **Ask for specifics.** If an answer is vague or says "we" throughout, ask for the
  concrete situation, numbers, results, or their individual contribution.
- **Test claims.** When the candidate states an achievement, probe how it was
  measured and what the baseline was.
- **Probe polished answers.** A rehearsed-sounding answer gets one probe for a
  detail that couldn't have been rehearsed.
- **One topic at a time.** Finish a thread before starting a new one, and keep your
  own turns short.

### With a plan

`buildInterviewBrief` takes the plan (nil for none) and adds a "Your interview
plan (private notes)" section:

- The core questions in order, each with its time budget and what it tests.
- Each question's probes: use them when the answer doesn't already cover them, and
  adapt them to what was actually said.
- What a strong answer covers: use it to decide what to probe for; never hint at
  it or read it out.
- The resume claims to verify, worked in where they fit naturally.
- Rules for following the plan:
  - Cover every core question.
  - Reword the questions naturally rather than reading them out.
  - Follow up on what the candidate actually said before moving on.
  - When over a question's time budget, move on.

The plan is in the setup message, so a fresh session after a dropped call (the
rejoin) keeps it.

### Cues

`liveCues(minutes, hasPlan)`. With a plan, the wrap-up cue adds: "If a core
question from your plan hasn't been asked yet, ask the most important one before
wrapping up."

### Grading

When the interview has a plan, `scoringPrompt` includes it and `scoringInstruction`
adds:

- Judge each planned question's answer against its strong-answer points, and say in
  `improve` which points were missed.
- Note which resume claims were backed with specifics and which weren't.
- If the interviewer skipped core questions, say so in the summary. This does not
  lower the candidate's scores.
- Set `planIndex` on each question review (see below).

Scorecard schema change: `QuestionReview` gains an optional `planIndex` (integer,
0-based index into the plan's questions; omitted for off-plan questions or when
there is no plan). In Go: `PlanIndex *int \`json:"planIndex,omitempty"\``. Older
scorecards stay valid.

## 3. Screens

### Interview setup modal (`InterviewSetupModal`)

- **"Questions planned by" dropdown**, defaulting to the setting. Unavailable
  providers are disabled with their reason. ("No plan" is offered only as the
  failure fallback below, not in the dropdown.)
- **While planning:** the Start button reads "Preparing your questions with
  <provider>…" with a spinner; the modal stays open.
- **On failure:** the error shows in the modal with Try again, the dropdown to
  switch provider, and Start without a plan.
- **Retry mode** (opened with an interview to retry):
  - Header: "Retry: same questions as the interview on <date>".
  - Type and length are locked to the original; the planner dropdown is hidden.
  - Voice, interviewer name, persona and focus stay editable.

### Starting a retry

- A **Retry these questions** button in the review page header, when the interview
  has a plan.
- A **Retry these questions** item in the Interviews page right-click menu.

### Review page

- **Plan tab**, beside the scorecard tabs, when there is a plan. It shows:
  - each question with what it tests, its probes and its strong-answer points
  - the resume claims
  - "Planned by <provider> · <model>"
- **Attempts strip**, when the plan has more than one attempt: "Attempt N of M",
  then one chip per attempt (date and average score) that links to it.
- **Compare attempts panel**, when the plan has more than one attempt:
  - Per attempt, the five score dimensions side by side, from each attempt's newest
    scorecard.
  - Per planned question, each attempt's `answerSummary` and `improve`, matched
    by `planIndex`.
  - Question reviews without a `planIndex` are listed per attempt under "Other
    questions".

### Interviews page

- An "Attempt N" chip on attempts after the first.
- A list icon on interviews that have a plan.

### Settings → AI providers

A third row, "Question plan provider", with the note: "Gemini Live is fastest;
Claude Code and the Anthropic API usually write deeper questions but take up to a
minute."

### Backend additions for the screens

- `MockInterview` gains:
  - `plan *InterviewPlanRecord` (provider, model, plan, created at)
  - `planError string` (set when the stored plan can't be read)
  - `attempt int`
  - `attempts []AttemptSummary` (id, started at, latest overall scores)
- The attempts' question reviews for the comparison come from a binding
  `ListPlanAttempts(id)` that returns each attempt's newest scorecard.
- `MockInterviewSummary` gains `hasPlan bool` and `attempt int`.

## 4. Errors and edge cases

- **Planning fails** (login, quota, timeout, invalid output): no interview record
  and no token; the error reaches the modal.
- **App closes while planning:** the app-lifetime context cancels the run. For
  Claude Code this kills the process tree and removes the temp folder.
- **Retry of an interview without a plan:** the Retry actions are hidden, and the
  backend refuses with "This interview has no question plan to retry."
- **Unreadable stored plan:** the interview loads with `planError` set and no Plan
  tab or attempt comparison. The Interviews list never parses plans, so one bad
  plan can't break it.
- **Last attempt deleted:** the plan is deleted with it.

## Testing

TDD for each piece.

**Go:**
- plan task schema and instruction; question count scaling with length; plan
  validation
- brief with and without a plan (questions, probes and the never-read-out rule
  present); stronger rules always present
- wrap-up cue with `hasPlan`
- `prepareInterview`:
  - uses the setting's or the overridden provider; stores and links the plan
  - a planning failure creates no record
  - `"none"` makes no AI call and gives no plan
  - retry reuses the plan with no AI call; retry of an interview without a plan
    is refused
- migration 9 on v8 data (raw SQL inserts)
- attempt numbering; deleting the last attempt removes the plan, deleting one of
  two keeps it
- scoring prompt includes the plan; an unreadable plan doesn't break loading
- the plan task running through each provider's existing fake (Gemini Live fake
  socket, Anthropic fake server, fake Claude CLI)

**Frontend (vitest):**
- plan view rendering
- attempts strip and labels
- comparison grouping by `planIndex`, with a fallback for entries without one
- setup modal retry mode locks type and length

**Live check:** one real interview planned by Claude Code, then a retry, with
`JOBTRACK_DATA_DIR` pointed at a scratch folder.

## Out of scope

Editing plans, choosing individual questions, plans shared across jobs,
mid-interview question tracking, and the deferred minors from the AI providers
review.
