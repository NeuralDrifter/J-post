# Phase 2a Offer Comparison — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Compact plan: specs per task, not full code (user preference). Go tasks follow TDD (failing test → implement → pass → commit).

**Goal:** Side-by-side comparison of offers, estimates, counters and the current job: total comp, take-home, equity scenarios, market percentile (BLS) and cost of living (BEA), with every dataset-derived value source-marked.

**Architecture:**
- **Python build step:** turns `datasets/` into an embedded `marketdata.json.gz`.
- **Go:** embedded tax tables, a pure calculation engine, a `comp_packages` repository and thin `App` methods.
- **React:** an Offers page, a package editor, a detail-page panel and Settings additions.

**Spec:** `docs/superpowers/specs/2026-10-01-phase2a-offer-comparison-design.md`

## Global Constraints

- All Phase 1 constraints apply:
  - Imports through `lib/backend.ts`; the `api()` / `notifyDataChanged()` patterns.
  - Lumina tokens.
  - Lists never `nil`.
  - Timestamps in `tsLayout`.
  - `SetMaxOpenConns(1)`: don't query `r.db` inside a transaction.
- **Money:** whole dollars as `int64` in Go and `number` in TS. Percentages are stored as 0–100 floats.
- **Marked values:** every value from BLS, BEA or tax tables is rendered with `<SourceMark>`. No unmarked dataset numbers.
- **Datasets:** `datasets/` is never committed. Only the generated `marketdata/marketdata.json.gz` and `taxdata/us_2026.json` are.
- **Tax figures:** come from cited sources, never from memory. Each state entry has `source` and `year`.

## Review Focus

1. **Area or occupation missing from OEWS** (a small metro, a rare role). Expected: falls back to the state, then the US, with the level named in the tooltip; never a blank or crash. Test: `TestMarketPositionFallbacks`.
2. **Top-coded wages (`#`, ≥ $239,200).** Expected: shows "≥ 90th" or "≥ p75", never a fake number. Test: `TestMarketPositionTopCoded`.
3. **Options under water** (strike > share value) and multiplier 0. Expected: $0, never negative. Test: `TestEvaluateOptionsUnderwater`.
4. **401k contribution above the match cap, or zero base.** Expected: the match is capped and nothing divides by zero. Test: `TestEvaluateBenefitsEdgeCases`.
5. **Income above the Social Security wage base / additional Medicare threshold.** Expected: SS stops at the base and the extra 0.9% starts at the threshold. Test: `TestComputeTaxFICA`.

---

### Task 1: Market data build script

**Files:** `tools/build_marketdata.py`, `tools/test_build_marketdata.py`, output `marketdata/marketdata.json.gz`.

**Behavior:**
- Reads the OEWS xlsx with openpyxl (read-only, streaming) and the three RPP CSVs (latest year column, lines 1 and 3).
- Writes compact JSON (spec §3) as gzip.
- Prints row, area and occupation counts.
- Runs with the system Python (`python`, which has openpyxl), not the JobSpy venv.

**Tests (pytest or plain asserts run via `python tools/test_build_marketdata.py`):**
- US `15-1252` median = 135980.
- Denver `19740` exists with an RPP equal to the CSV's 2024 value.
- Top-coded cells are `-1`.
- The file is under 8 MB.

### Task 2: Go market data lookups

**Files:** `marketdata.go`, `marketdata_test.go`.

**Interfaces:**
- `type MarketData` with `loadMarketData() (*MarketData, error)`, loaded once (`sync.Once`).
- `MarketPosition(occ, area string, base int64) MarketResult`, where `MarketResult{Percentile float64; Below10, AtOrAboveTop bool; Points [5]int64; Level string /* "area"|"state"|"national" */; AreaTitle, OccTitle string}`.
- `CostOfLiving(area string) (index float64, level string)`.
- `SearchOccupations(q) []Option`, `SearchAreas(q) []Option` (`Option{Code, Title, State}`).
- `GuessArea(locationText) string`.

**Tests:**
- `TestMarketPositionInterpolates` (base exactly at the median → 50; halfway between p25 and p50 → 37.5).
- `TestMarketPositionFallbacks`.
- `TestMarketPositionTopCoded`.
- `TestCostOfLivingFallbackChain`.
- `TestGuessArea` ("Denver, CO" → 19740; "Remote" → US).
- `TestSearch`.

### Task 3: Tax tables and engine

**Files:** `taxdata/us_2026.json`, `taxes.go`, `taxes_test.go`.

**Steps:**
1. Research the 2026 federal figures (IRS Rev. Proc. for TY2026: brackets, standard deductions, SS wage base) and the state 2026 brackets for all 50 + DC (Tax Foundation 2026 table, cross-checked against state revenue departments for flat and no-tax states). Record `source` and `year` per entry.
2. Write the JSON, embedded via `//go:embed`.
3. Implement `ComputeTax(TaxInput) TaxResult` per spec §4.

**Tests:**
- `TestComputeTaxFederalSingle` (hand-checked).
- `TestComputeTaxMarriedCA`.
- `TestComputeTaxNoIncomeTaxState`.
- `TestComputeTaxFlatState`.
- `TestComputeTaxFICA` (Review Focus #5).
- `Test401kReducesIncomeTaxNotFICA`.
- `TestAllStatesPresentAndWellFormed`: 51 entries; brackets ascending; rates between 0 and 0.15.

### Task 4: Comp packages repository

**Files:** `comp.go` (types and CRUD), `comp_test.go`; append migration 2 to `migrations` in `db.go`.

**Interfaces:**
- `type CompPackage` with every spec §2 column. JSON in camelCase. Percentages are `float64`; money is `int64`; `jobId` and `parentId` are strings ("" = null).
- `(r *Repo) ListCompPackages() ([]CompPackage, error)`
- `ListCompPackagesForJob(jobID)`
- `GetCompPackage(id)`
- `SaveCompPackage(p) (CompPackage, error)`: insert or update, with validation.
- `DeleteCompPackage(id)`
- `DraftCounter(offerID) (CompPackage, error)`: copies the offer as kind `counter`, with label "Counter: <label>".
- `NewEstimateForJob(job Job, occ, area string) CompPackage`: a prefill, not saved.

**Tests:**
- `TestCompPackageCRUD`.
- `TestOnlyOneCurrent` (saving a second `current` errors).
- `TestDeleteJobCascadesPackages`.
- `TestDeleteOfferKeepsCounter`.
- `TestDraftCounter`.
- `TestCompValidation`.
- `TestEstimatePrefill` (a range gives the midpoint).
- `TestMigration2OnPhase1DB`: a v1 database upgrades, and the backup file is created.

### Task 5: Calculation engine

**Files:** `compcalc.go`, `compcalc_test.go`.

**Interfaces:**
- `Evaluate(p CompPackage, s Settings, md *MarketData, current *CompPackage) PackageResult`.
- `PackageResult{Years [4]YearBreakdown; Year1Total, FourYearTotal, AvgPerYear int64; Year1TakeHome int64; Tax1 TaxResult; DeltaVsCurrent *Deltas; PTOValue int64; Scenarios []Scenario; Market *MarketResult; COLIndex, HomeCOLIndex float64; COLLevel string; Year1COLAdjusted int64; Warnings []string}`.
- `YearBreakdown{Base, Bonus, Signing, Equity, Benefits, Total, Taxable, TakeHome int64}`.

**Tests:**
- `TestEvaluateStandardVesting`, `TestEvaluateBackloaded`, `TestEvaluateCustomVesting`.
- `TestEvaluateRaises`.
- `TestEvaluateOptionsUnderwater` (Review Focus #3).
- `TestEvaluateBenefitsEdgeCases` (Review Focus #4).
- `TestEvaluateDeltaVsCurrent`.
- `TestEvaluateCOL`.
- `TestScenarios`.

### Task 6: App bindings and settings

**Files:** `app.go`, `settings.go` (+ tests), and regenerate the bindings.

**New settings:** `filingStatus`, `homeAreaCode`, `defaultOccupation`, with defaults `single`, `US`, "".

**New bound methods:**
- `ListComparisons() ([]ComparisonItem, error)`, where `ComparisonItem{Package CompPackage; Result PackageResult; Company, Position, JobStatus string}`.
- `ListCompForJob(jobID)`
- `SaveCompPackage`, `DeleteCompPackage`, `DraftCounter`
- `NewEstimate(jobID)`: a prefilled estimate, not saved.
- `PreviewComp(p) (PackageResult, error)`: drives the live preview in the editor.
- `SearchOccupations`, `SearchAreas`
- `MarketSources() []SourceInfo`, with the release, URL and build date from the data files.

**`ListJobSummaries` addition:** gains `Year1Total *int64` for jobs that have an `offer` package.

**Tests:** settings defaults and round trip, including the new fields.

### Task 7: Frontend foundations

**Files:**
- `lib/comp.ts`: blank package factory, kind labels, vesting labels, `formatMoneyFull`, delta formatting, percentile label.
- `lib/comp.test.ts`.
- `components/SourceMark.tsx`: `✦¹/²/³` superscript and tooltip.
- `components/SourcesFooter.tsx`.
- `lib/sources.ts`: source registry and detail-text builders, with tests.

**Verify:** `npm test` and `tsc`.

### Task 8: Package editor

**Files:** `components/comp/{PackageEditor,OccupationPicker,AreaPicker}.tsx`.

**Behavior:**
- A modal with Cash / Equity / Benefits / Location & taxes sections.
- Equity fields switch with the equity type.
- The custom vesting inputs show a running sum.
- Pickers search via the backend (debounced 200ms).
- The tax state is prefilled from the chosen area's state.
- A live preview (`PreviewComp`, debounced) shows year-1 total, take-home✦³ and percentile✦¹.
- Save uses `SaveCompPackage` and then notifies.

### Task 9: Offers page

**Files:** `pages/Offers/{OffersPage,PackageCard,CompChart,BreakdownTable,ScenariosTable,MarketStrip}.tsx`; the nav item and route.

**Behavior:**
- Cards come from `ListComparisons`. The selection is stored in prefs; the default is offers plus current.
- **Card actions:** edit, draft counter (offers only), delete with confirm. The current-job card is always first.
- **CompChart:** inline SVG stacked bars, 4 years × the selected packages, using Lumina colors, with a legend and accessible labels.
- **BreakdownTable:** rows are line items plus each tax line✦³; columns are packages (year 1 and 4-year).
- **ScenariosTable:** only shown if equity exists.
- **MarketStrip:** a p10–p90 bar with a base marker✦¹ and the COL-adjusted figure✦².
- `SourcesFooter` sits at the bottom.
- **Empty state:** "Add an offer or estimate from a job's page, or set your current job in Settings."

### Task 10: Job detail panel, pipeline chip, Settings

**Files:**
- `pages/JobDetail/CompPanel.tsx`, wired into the right column.
- `JobCard`: shows the year-1 total chip when one is available.
- `SettingsPage`:
  - A "Compensation" section with filing status, home location (`AreaPicker`) and default occupation (`OccupationPicker`).
  - A "Current job" card (Edit / Set up) that opens `PackageEditor` with kind `current`.

### Task 11: Verify and document

1. Run `go vet`, `go test ./...`, `npm test`, `npm run build`, `python tools/test_build_marketdata.py` and `wails build`.
2. Update the README: an Offers section, a data sources section, and how to refresh the datasets yearly (download list plus `python tools/build_marketdata.py`).
3. Hand off to the user for a manual run. No browser automation.
