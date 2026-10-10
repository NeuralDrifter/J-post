# Job Track

A desktop job-search tracker: a dark "mission control" pipeline board, a detail page per application, and a Discover page that searches several job boards at once. Built with [Wails](https://wails.io) (Go backend + React/TypeScript frontend). Everything is stored locally.

## Features

- **Pipeline board**: Interested → Applied → Interviewing → Offer → Closed, with drag-and-drop. Closing a job asks why (not selected, I withdrew, no response, I declined) so your history stays honest without being a wall of rejections.
- **Live metrics**: active applications, response rate, interviews this week, and follow-ups due. These are computed from real data; nothing is faked.
- **Table view and filters**: sortable table, plus work mode, source and quick search filters.
- **Job detail page**:
  - automatic stage history timeline
  - job description and autosaving markdown notes
  - contacts, scheduled interviews, and attached files (copies of the exact resume or cover letter you sent)
- **Discover**: searches several job boards at once and files every posting in a persistent **inbox**.
  - New postings are badged.
  - Add each one to **Interested** or mark it **Not interested**, which hides it for good. A Not interested tab lets you move postings back.
  - Searches are saved. Re-running one within the cache window (default 12 hours, set in Settings) reuses stored results; later runs only fetch postings newer than the last run.
  - Results per board are adjustable.
  - **Match scores:** an AI provider of your choice grades each posting against your resume and preferences (salary floor, work mode and location, seniority, goals). Postings go in groups, so a normal search costs one request; click a badge for the breakdown. Off by default (Settings → Job matching).
  - Sources:

    | Source | Type | Setup | Notes |
    |---|---|---|---|
    | Adzuna | Official API | Free key | Max 50 results per search |
    | USAJobs | Official API | Free key + registered email | Federal jobs |
    | Himalayas | Official API | none | Remote jobs; credited and linked to Himalayas |
    | Jobicy | Official API | none | Remote jobs; at most one request per hour (enforced) |
    | The Muse | Official API | Pick categories in Settings | No keyword search in its API, so category × location slices are copied locally (refreshed daily) and searched locally |
    | Indeed, LinkedIn, ZipRecruiter | Scraped via [JobSpy](https://github.com/speedyapply/JobSpy) | Python venv | Runs locally from your IP; sites may rate-limit or block |
- **Offers**:
  - Compare real offers, estimates, counter-offer drafts and your current job side by side.
  - Each one shows 4-year total comp with vesting schedules and raises, after-tax take-home, equity scenarios (0×/1×/3×/10×), where the base sits in the local market for your occupation, what it's worth in your home city's dollars, and, if you have no current job set, how its base compares with the typical (median) pay for your occupation where you live.
  - Every figure that comes from a government or published dataset is marked ✦¹ ✦² ✦³. Hover the mark to see exactly which data was used.
- **Mock interviews (AI)**: a real-time voice interviewer (Google Gemini Live) for any job on your board.
  - It has read the job description, your notes and your resume.
  - Pick the interview type, length (10/25/45 min), interviewer style, voice and focus.
  - Live coaching cues (pace, filler words, answer timer, and a one-line AI tip after each answer) can be hidden for a realistic run.
  - Afterwards you get a scorecard (communication, structure, relevance, depth, confidence), per-question feedback with a stronger example answer, and three things to practice. The transcript and a recording are saved to the job; click a transcript line to replay it.
  - Needs a Gemini API key (Settings → AI). Upload your resume in Settings → Resume.
- **Screen-aware window**: opens sized to your monitor (or maximised on small screens) and remembers its size.

## Setup

Requirements: Go 1.23+, Node 20+, the Wails CLI (`go install github.com/wailsapp/wails/v2/cmd/wails@latest`), and Python 3.10+ for Discover.

```powershell
# Python environment for Discover (from the project folder)
python -m venv venv
.\venv\Scripts\pip install python-jobspy
```

Discover looks for Python in this order:
1. The path set in **Settings**.
2. `venv\Scripts\python.exe` next to `Job_Track.exe`.
3. `venv\Scripts\python.exe` in the current folder.

The **Test** button in Settings shows which one it found.

Adzuna is optional. Get free keys at [developer.adzuna.com](https://developer.adzuna.com/) and enter them in Settings.

## Develop, test, build

```powershell
wails dev                      # live-reloading app (also served at http://localhost:34115)
go test ./...                  # backend tests
cd frontend; npm test          # frontend tests
wails build                    # produces build\bin\Job_Track.exe
bash tools/verify.sh           # everything above except the build, in one go
```

## Project layout

```
main.go              entry point: serves an AI task to Claude Code, or opens the window
internal/
  app/               Wails bindings, the SQLite database and the interview flow
  ai/                AI task runner and providers (Gemini Live, Anthropic, Claude Code, OpenAI-style)
  gemini/            Gemini REST calls, Live sessions and voice samples
  discover/          job-board fetchers (JobSpy, Adzuna, The Muse, USAJobs, Himalayas, Jobicy)
  comp/              offer packages and their evaluation
  resumes/           the resume builder's font cache
  settings/          user settings and window state
  taxes/             2026 federal and state income tax (embedded tables)
  marketdata/        BLS/BEA wage and cost-of-living data (embedded)
  httpapi/           shared HTTP client
  textproc/          string and HTML helpers
  osproc/            starting, stopping and opening things in the OS
  licensegen/        builds the open-source licenses list
frontend/            React + TypeScript UI; lib/backend.ts is its only door to the Go side
  src/vendor/        third-party source copied in (Reactive Resume; see its UPSTREAM.md)
tools/               data build scripts, the licenses and vendoring scripts, and verify.sh
```

A package only imports packages listed below it, and nothing imports `app`.
Tests sit next to the code they test, as Go requires. `ai/aitest` and
`gemini/geminitest` provide fake servers for tests in other packages.

## Included code

The resume engine (data model, templates, PDF and Word export, importers and ATS checks) is
[Reactive Resume](https://github.com/reactive-resume/reactive-resume) by Amruth Pillai, MIT
licensed, copied into `frontend/src/vendor/reactive-resume/`. Its `UPSTREAM.md` records the
upstream commit and every local change; `bash tools/vendor_reactive_resume.sh <checkout>`
re-syncs it.

## Data sources for Offers

| Mark | Source | Used for |
|---|---|---|
| ✦¹ | [BLS Occupational Employment and Wage Statistics](https://www.bls.gov/oes/), May 2025 | Pay percentiles by occupation and metro area |
| ✦² | [BEA Regional Price Parities](https://www.bea.gov/data/prices-inflation/regional-price-parities-state-and-metro-area), 2024 | Cost of living by metro area, state metro/nonmetro portion, and state |
| ✦³ | IRS Rev. Proc. 2025-32, SSA, and the [Tax Foundation 2026 state table](https://taxfoundation.org/data/all/state/state-income-tax-rates-2026/) | Federal, FICA and state income tax estimates |

Tax figures are estimates for wage income only. Credits beyond state exemption credits, AMT, itemizing, and state-specific phase-outs are not modeled. Head-of-household filers use the single state schedules.

**Refreshing the data each year:** the raw files live in `datasets/` (git-ignored), and the app embeds compact files generated from them.
1. Download the new BLS OEWS "all data" xlsx, the BEA MARPP, PARPP and SARPP CSVs, and the Tax Foundation state xlsx into `datasets/`. Then update the file names and years at the top of the two build scripts.
2. Run `python tools/build_marketdata.py` and `python tools/test_build_marketdata.py`. This needs a Python with `openpyxl`.
3. Run `python tools/build_taxdata.py` and update the federal constants in it from the new IRS/SSA releases.
4. Run `go test ./...`, then `wails build`.

## Your data

Data lives in `%USERPROFILE%\.jobtrack\`:
- `jobtrack.db`: SQLite database.
- `settings.json`: settings, including your API keys.
- `files\`: attached documents.

Back up this folder to keep your history. Before any schema upgrade the app writes `jobtrack.db.bak-vN`. An old `data.json` from earlier versions is imported automatically once and renamed to `data.json.bak`.

Set `JOBTRACK_DATA_DIR` to use a different folder, which is useful for testing with throwaway data.

## License

Job Track is released under the [MIT License](LICENSE). Copyright (c) 2026 Michael P. Burgus ([NeuralDrifter](https://github.com/NeuralDrifter)).

Every source file starts with that copyright line and `SPDX-License-Identifier: MIT`; `go test ./...` checks it, so add both to new files. Third-party libraries, fonts, data and the Wails template files in `build/` keep their own licenses.

## Credits

Built with assistance from:
[<img src="https://github.com/anthropics.png" width="22" height="22" valign="middle" alt="Anthropic logo"> Claude Opus 5.5 (Anthropic)](https://www.anthropic.com/claude) ·
[<img src="https://github.com/google.png" width="22" height="22" valign="middle" alt="Google logo"> Google Stitch](https://stitch.withgoogle.com/) (visual design ideas; no mockup code copied)

## Third-party licenses

Settings → About → **Open-source licenses** lists every library compiled or bundled into the app with its full license text, plus the data sources, the services the app connects to, and the projects that shaped it. The library list is generated: after adding, removing or upgrading a Go module or a frontend dependency, run

```
go generate ./...
```

`go test ./...` fails while the list is out of date. Data sources, services and thanks are hand-written in `frontend/src/pages/Licenses/credits.ts`.
