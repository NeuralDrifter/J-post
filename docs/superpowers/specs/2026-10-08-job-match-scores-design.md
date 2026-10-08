# Job match scores on Discover — Design Spec

**Date:** 2026-10-08 · **Status:** Implemented (branch feature/job-match-scores); live run pending · **Builds on:** [AI providers](2026-10-07-ai-providers-design.md) (the task/provider layer, now `internal/ai`), [Discover inbox](2026-10-01-discover-inbox-design.md)

## Goal

Every posting in the Discover inbox can show a **match %**: how well the job
fits the user's resume and stated preferences. The score is graded by
whichever AI provider the user picks, in a few large requests per search
rather than one per posting, so free plans with requests-per-day limits stay
usable.

**Visual reference:** the Stitch mockup
`reference/example_only_non_functioning_demo content/stitch_careerpilot_ai_tracker/job_discovery_orbit_ai/`
(the "96%" badge on each card and the "Suitability Diagnostics" panel). As
with the earlier redesign, the mockup is a reference only; none of its HTML
is copied.

**Decisions made with the user:**
- The score weighs resume fit **and** preferences: salary floor, work mode and
  location, target seniority, and free-text goals and deal-breakers.
- Cards show **only the badge**. Clicking it opens a pop-up with the breakdown.
- The breakdown is produced **in the same request** as the score and stored
  with it, so the pop-up opens instantly and always matches the number.
- Postings go to the AI as **JSON inside an ordinary request**, many per
  request. Provider "batch APIs" (Anthropic Message Batches, OpenAI Batch) are
  not used.
- Requests are **split only when large** (default 25 postings per request) to
  respect output limits and small local-model contexts while spending as few
  requests as possible.
- Scoring is **switched on or off in Settings** (default off).
- While a search runs, a status line says what is happening: searching boards,
  then scoring.
- Outdated scores (graded against an older resume or preferences) are flagged,
  not re-graded automatically. The user re-scores one posting or all outdated
  ones on request. Any unscored posting has a "Score this" action.

**Out of scope:** the mockup's "Why you fit / Interview angles / Requirements
checklist" panel, a "Match > N%" filter, scoring Pipeline jobs (only Discover
postings), provider batch APIs, automatic retries.

## 1. Settings

A new **Job matching** section in Settings. New `settings.Settings` fields:

| Field (JSON) | Type | Default | Meaning |
|---|---|---|---|
| `matchEnabled` | bool | `false` | Score new postings automatically after a search |
| `matchProvider` | string | `gemini-live` | An AI provider ID, validated like the other `*Provider` fields |
| `matchPerRequest` | int | `25` | Postings per request; `Save` rejects values outside 5–50 |
| `matchMinSalary` | int64 | `0` | Annual salary floor in dollars; 0 = no floor |
| `matchWorkModes` | []string | `[]` | Any of `remote`, `hybrid`, `onsite`; empty = no preference |
| `matchLocations` | string | `""` | Free text, e.g. "Denver, CO; Boulder, CO" |
| `matchSeniority` | string | `""` | One of `entry`, `mid`, `senior`, `staff`, `principal`, `manager`; empty = no target |
| `matchGoals` | string | `""` | Free text: what the user wants, must-haves, deal-breakers |

`ApplyDefaults` fills `matchProvider`, `matchPerRequest` and a non-nil
`matchWorkModes`. `Save` validates the provider ID, the range of
`matchPerRequest`, each work mode, the seniority value and a non-negative
salary floor, with messages in the style of the existing checks.

## 2. Stored scores

New table, added by a new schema migration in `internal/app/db.go`:

```sql
CREATE TABLE posting_scores (
	posting_id TEXT PRIMARY KEY REFERENCES postings(id) ON DELETE CASCADE,
	overall INTEGER NOT NULL,          -- 0-100, computed in Go (section 4)
	factors TEXT NOT NULL,             -- JSON: the four factors (section 4)
	strengths TEXT NOT NULL,           -- JSON array, up to 3 short strings
	gaps TEXT NOT NULL,                -- JSON array, up to 3 short strings
	fingerprint TEXT NOT NULL,         -- profile fingerprint at scoring time
	provider TEXT NOT NULL,
	model TEXT NOT NULL,
	scored_at TEXT NOT NULL
);
```

A failed score is **not** stored: the posting simply stays unscored and the
UI offers "Score this".

**Profile fingerprint:** SHA-256 over the resume text plus the five preference
fields (`matchMinSalary`, `matchWorkModes`, `matchLocations`, `matchSeniority`,
`matchGoals`; normalized: trimmed, work modes sorted). It is computed when
scoring and when listing postings. A stored score whose fingerprint differs
from the current one is **outdated**. Changing the provider, the on/off switch
or `matchPerRequest` does not make scores outdated.

`Posting` gains `Match *MatchScore` (`json:"match,omitempty"`), filled by
`ListPostings`/`GetPosting` with a LEFT JOIN. `App.ListPostings` then sets
`outdated` by comparing each score's fingerprint with the current one (the
Repo doesn't read settings). `MatchScore` carries `overall`,
`factors`, `strengths`, `gaps`, `provider`, `model`, `scoredAt` and
`outdated bool`.

## 3. Flow

**Search status.** The Discover page shows a status line while it works:
1. "Searching Indeed, LinkedIn, … — 2 of 5 boards done". `runDiscover` emits a
   Wails event `search:progress` `{done, total}` as each board finishes. This
   is the only change to the search itself; results and errors are unchanged.
2. The search returns and results appear as today.
3. If `matchEnabled` and the search added new postings, the page calls
   **`ScoreInbox()`**. The status line becomes "Scoring matches… 0 of 37" and
   updates on each `match:progress` event `{done, total}`. After each request
   the page re-fetches postings, so badges fill in request by request.
4. At the end the status line clears, or shows why scoring stopped (e.g.
   "Scoring stopped: Anthropic rejected the API key").

**App methods** (Wails-bound):
- `ScoreInbox() (MatchRun, error)`: scores every inbox or saved posting with
  no stored score, newest first.
- `RescoreOutdated() (MatchRun, error)`: scores only postings whose score is
  outdated.
- `ScorePosting(id string) (MatchRun, error)`: scores one posting (a request
  of one), whether or not it already has a score.

`MatchRun` reports `{scored, failed, total, error}`. All three share one
runner:
- **Split** the postings into requests of at most `matchPerRequest`.
- Send them **one after another**, never in parallel.
- **No automatic retries.**
- **One run at a time:** a second call while a run is going returns at once
  with an error the page shows as "Scoring is already running".
- If a request fails, the run **stops**: the remaining postings stay unscored
  and the error is reported. A provider failing once (bad key, rate limit) is
  likely to fail again, and stopping saves the user's requests.

**Safeguards.** No request is sent when:
- the resume text is empty: "Add your resume on the Profile page to get match scores";
- the provider is unavailable: "Job matching: " + the provider's own
  `unavailable` reason (the same wording interview grading uses);
- there is nothing to score: returns `{total: 0}` without calling the provider.

## 4. The AI task and the score

**Task.** New `jobMatch` task built in `internal/app` (next to the interview
tasks), with a new role **`ai.RoleMatching`** and per-provider budgets:
- Anthropic: 16,000 output tokens, 5-minute timeout, the grading effort setting.
- Claude Code: 5-minute timeout.
- Gemini Live and OpenAI-style providers: their existing per-run limits, plus a
  5-minute bound where they have per-role timeouts.

**Input** (the task's `Input`, JSON):

```json
{
  "candidate": {
    "resume": "…",
    "preferences": {"minSalary": 150000, "workModes": ["remote"], "locations": "Denver, CO",
                    "seniority": "senior", "goals": "no on-call; climate or health preferred"}
  },
  "postings": [
    {"id": "p_123", "title": "…", "company": "…", "location": "…", "workMode": "remote",
     "salary": "$140k–$170k/yr", "description": "first ~1,500 characters…"}
  ]
}
```

Unset preferences are omitted. Descriptions are cut to 1,500 characters with
`textproc.Truncate`.

**Instruction (system prompt):** score each posting for this candidate. Give
each factor 0–100 with a one-line note, or mark it not applicable. Treat goals
and deal-breakers as part of resume fit; a deal-breaker the posting hits must
appear as a gap. Return exactly one result per posting ID. Don't invent facts
that aren't in the resume or posting.

**Answer schema** (standard JSON Schema, like the other tasks):

```json
{"results": [{
  "id": "p_123",
  "resumeFit": {"score": 0-100, "note": "…"},
  "seniority": {"applicable": true, "score": 0-100, "note": "…"},
  "location":  {"applicable": true, "score": 0-100, "note": "…"},
  "salary":    {"applicable": false, "score": 0, "note": "no salary listed"},
  "strengths": ["…"], "gaps": ["…"]
}]}
```

Every property is required (so the schema is OpenAI-strict compatible). A
not-applicable factor carries `applicable: false` and a note saying why. Go
truncates `strengths` and `gaps` to 3 entries each.

**Overall %** is computed in Go, never taken from the AI:

| Factor | Weight |
|---|---|
| Resume fit (skills, experience, domain, goals) | 50 |
| Seniority vs target | 20 |
| Work mode and location | 15 |
| Salary vs floor | 15 |

`overall = round(Σ weight × score / Σ weight)` over the applicable factors
(resume fit always applies). Scores outside 0–100 are clamped. The weights are
constants in code, not settings.

**Matching answers to postings.** Results are matched by `id`. A posting with
no result, a duplicate result or a malformed entry is counted as failed and
stays unscored; the other results in the same answer are saved. IDs the AI
invents are ignored.

## 5. UI

**Discover cards** (`PostingList`) get a badge at the top right:
- **Scored:** the % in a pill, colored by band: 80+ green, 60–79 amber, below
  60 grey (theme tokens).
- **Being scored in the current run:** a pulsing placeholder pill.
- **Unscored or failed:** a faint "–" pill and a "Score this" link.
- **Outdated:** the pill dims and shows a small ↻.

**Pop-up** (opens from the badge, using the existing `Modal`):
- the overall % large at the top;
- four factor rows: name, weight, a bar with the score, and the note.
  Not-applicable factors are greyed out with their reason;
- **Strengths** and **Gaps** lists;
- footer: "Scored by <model> (<provider label>), <date and time>";
- if outdated: "Graded against an older resume or preferences" and a
  **Re-score** button (`ScorePosting`).

**Status line** above the posting list shows the search and scoring messages
from section 3. When outdated scores exist and nothing is running, it offers
**Re-score outdated (N)**.

**Sorting:** a **Best match** option joins the list's sort choices (scored
postings by overall, descending, then unscored ones in the current order).

**Settings → Job matching:** the switch, the provider picker (the existing
provider list with readiness reasons), postings per request, and the five
preference inputs.

## 6. Errors

- Provider errors use the provider's existing readable messages (key
  rejected, rate-limited, timed out), prefixed "Scoring stopped: ".
- An answer that isn't valid JSON or fails the schema fails that request (the
  existing JSON repair in the OpenAI-style provider still applies first).
- Search errors are unchanged and independent of scoring: a failed scoring run
  never hides search results.

## 7. Testing

- **Go unit tests:**
  - overall-% math, including every combination of not-applicable factors and clamping;
  - splitting into requests (sizes 1, exactly N, N+1);
  - fingerprint stability and change detection;
  - each safeguard sends no request;
  - partial answers: a missing ID, a duplicate, an invented ID;
  - stop-on-failure keeps earlier requests' scores;
  - one-run-at-a-time;
  - settings defaults and validation.
- **Task tests:** the `jobMatch` schema passes `checkStandardSchema` and
  `ai.StrictCompatible` in `aitask_tasks_test.go`; the Anthropic budget for
  `RoleMatching` is pinned like `TestPlanningRoleLimits`.
- **End to end:** `ScoreInbox` through `aitest.FakeAnthropic` stores scores,
  emits progress, and `ListPostings` returns them with `outdated` set correctly
  after the resume changes.
- **Frontend (vitest):** badge band and state formatting, factor-row
  formatting (including not applicable), "Best match" sort order.
- **Manual:** a real search with scoring on, against at least one real provider.
  Record the model, number of postings, number of requests and time taken here.
