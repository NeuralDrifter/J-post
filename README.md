# Job Track

A desktop job-search tracker: a dark "mission control" pipeline board, a detail page per application, and a Discover page that searches several job boards at once. Built with [Wails](https://wails.io) (Go backend + React/TypeScript frontend). Everything is stored locally.

## Features

- **Pipeline board**: Wishlist → Applied → Interviewing → Offer → Closed, with drag-and-drop. Closing a job asks why (not selected, I withdrew, no response, I declined) so your history stays honest without being a wall of rejections.
- **Live metrics**: active applications, response rate, interviews this week, and follow-ups due. These are computed from real data; nothing is faked.
- **Table view and filters**: sortable table, plus work mode, source and quick search filters.
- **Job detail page**:
  - automatic stage history timeline
  - job description and autosaving markdown notes
  - contacts, scheduled interviews, and attached files (copies of the exact resume or cover letter you sent)
- **Discover**:
  - searches Indeed, LinkedIn and ZipRecruiter (via [JobSpy](https://github.com/speedyapply/JobSpy)) plus Adzuna in parallel
  - de-duplicates results, flags jobs you already track, and saves to your Wishlist with the description, salary and link
- **Offers**:
  - Compare real offers, estimates, counter-offer drafts and your current job side by side.
  - Each one shows 4-year total comp with vesting schedules and raises, after-tax take-home, equity scenarios (0×/1×/3×/10×), where the base sits in the local market for your occupation, and what it's worth in your home city's dollars.
  - Every figure that comes from a government or published dataset is marked ✦¹ ✦² ✦³. Hover the mark to see exactly which data was used.
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
```

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
