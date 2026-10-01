# Phase 2a — Offer & Compensation Comparison — Design Spec

**Date:** 2026-10-01 · **Status:** Draft for review · **Builds on:** Phase 1 (`2026-10-01-phase1-redesign-design.md`)

## 1. Purpose

The goal is to compare real offers, expected offers, counter-offer drafts and the user's current job side by side. The comparison covers total compensation, after-tax take-home, equity outcomes, market position for the role and location, and cost of living. Every figure derived from an external dataset is marked with its source.

**Out of scope:**
- Refresh grants.
- Tax credits, AMT, itemized deductions, multi-state allocation, local bracket tables (local tax is a flat %).
- Option exercise and AMT modeling.
- AI counter-offer advice (Phase 2b).

## 2. Comp packages (data model)

Migration 2 adds the `comp_packages` table.

| Group | Columns |
|---|---|
| Identity | `id`, `job_id` (nullable; required unless kind=`current`), `kind` (`offer`/`estimate`/`counter`/`current`), `label`, `parent_id` (the offer a `counter` copies; nullable), `created_at`, `updated_at` |
| Cash | `base_salary`, `signing_bonus`, `signing_clawback_months`, `target_bonus_pct`, `annual_raise_pct` |
| Equity | `equity_type` (`none`/`rsu`/`options`), `rsu_grant_value`, `option_shares`, `option_strike`, `share_value`, `vesting` (`standard`/`backloaded`/`monthly`/`custom`), `vesting_custom` (4 comma-separated yearly %) |
| Benefits | `k401_match_pct`, `k401_match_cap_pct`, `k401_contrib_pct` (employee), `health_premium_annual` (employee cost), `stipends_annual`, `other_annual`, `pto_days` |
| Location | `occupation_code` (BLS SOC, e.g. `15-1252`), `area_code` (BLS/BEA area code, or `US` for remote/national), `tax_state` (2-letter), `local_tax_pct` |
| Other | `notes` |

**Rules:**
- At most one `current` package exists.
- Deleting a job cascades to its packages.
- Deleting an offer leaves its counters intact; their `parent_id` is set to null.
- **Vesting schedules:**
  - `standard` = 25/25/25/25, with a 1-year cliff (nothing in year 1 until month 12; all of year 1 counts as vested in year 1).
  - `backloaded` = 5/15/40/40.
  - `monthly` = 25/25/25/25 with no cliff.
  - `custom` must sum to 100.
- **Estimate prefill:** base = the midpoint of the job's salary range (or the one bound given); location = guessed from the job's location text.

**New settings:**
- `filingStatus`: `single`/`married`/`head`; default `single`.
- `homeAreaCode`: for the cost-of-living comparison; default `US`.
- `defaultOccupation`.

## 3. Market data (BLS OEWS + BEA RPP)

**Build step.** `tools/build_marketdata.py` reads the raw files in `datasets/` (git-ignored) and writes `marketdata/marketdata.json.gz`, which is embedded in the binary.

**Inputs:**
- `datasets/all_data_M_2025.xlsx` (BLS OEWS May 2025): rows with `I_GROUP='cross-industry'`, `O_GROUP='detailed'`, and area types 1 (US), 2 (state), 4 (MSA), 6 (nonmetro).
- `datasets/MARPP/MARPP_MSA_2008_2024.csv`, `datasets/PARPP/PARPP_PORT_2008_2024.csv`, `datasets/SARPP/SARPP_STATE_2008_2024.csv` (BEA RPP): latest year (2024), line 1 (all items) and line 3 (housing).

**Output contents:**
- `meta`: source names, releases, URLs and build date.
- `occupations`: code → title.
- `areas`: code → `{title, type, state}`.
- `wages`: area → occupation → `[p10, p25, p50, p75, p90]` annual. A top-coded value (`#`, meaning ≥ $239,200) is stored as `-1`.
- `rpp`: BEA geo code → `{all, housing}`.

**Location matching:**
- OEWS MSA codes equal BEA MSA GeoFIPS, so they join directly.
- Cost-of-living fallback chain for an area:
  1. MSA RPP.
  2. The state's metro or nonmetro portion RPP (PARPP), depending on whether the area is an MSA or a nonmetro area.
  3. State RPP.
  4. US = 100.
- Wage fallback: area → state → US, and the UI states which level was used.

**Go side.** `marketdata.go` loads the file once and provides:
- `MarketPosition(occ, area, base)`: the percentile (linear interpolation between the published points; below p10 → "<10"; at or above a top-coded point → "≥ that point"), the percentile values, and the area level actually used.
- `CostOfLiving(area)`: the index and which level was used.
- `SearchOccupations(q)` and `SearchAreas(q)`: case-insensitive substring match, max 30 results.
- `GuessArea(locationText)`: matches the city name and state against area titles; returns `US` for "Remote".

## 4. Tax engine

**Data.** `taxdata/us_2026.json` is embedded.
- **Federal:**
  - 2026 brackets and standard deduction for single, married filing jointly and head of household.
  - Social Security rate 6.2% up to the 2026 wage base.
  - Medicare 1.45%, plus 0.9% above $200k (single/head) or $250k (married).
- **All 50 states + DC:**
  - Type: `none`, `flat` or `brackets`.
  - Brackets per filing status.
  - Standard deduction and personal exemption where applicable.
  - Source and tax year.
- **Sourcing:** values come from official/authoritative publications (IRS Rev. Proc. for 2026; Tax Foundation "State Individual Income Tax Rates and Brackets, 2026"). They are researched and cited per state, never typed from memory. If a state's 2026 figures are unavailable, its 2025 figures are used and that year is recorded.

**`taxes.go`:** `ComputeTax(income TaxInput) TaxResult`.
- **Input:** wages, pre-tax 401k, filing status, state, local %.
- **Result:** federal, social security, medicare, state, local, total and effective rate.
- **Federal taxable income** = wages − 401k contribution − standard deduction, floored at 0.
- **State taxable income** = wages − 401k − the state deduction/exemption.
- FICA applies to all wages (401k does not reduce it).

## 5. Calculations (`compcalc.go`)

`Evaluate(pkg, settings) PackageResult` is a pure function.

- **Each year 1–4:**
  - **Pay and bonus:** base(y) = base × (1 + raise)^(y−1); bonus = base(y) × target %.
  - **Signing bonus:** paid in year 1.
  - **Equity vested this year:**
    - RSU: grant × that year's vest %.
    - Options: max(0, share value − strike) × shares × that year's vest %.
  - **Benefits value:** employer 401k match + stipends + other − health premium.
    - Employer match = min(contribution %, cap %) × match % × base(y).
- **Taxable income** = base + bonus + signing + RSU vest. Options are excluded because they are assumed not exercised, and the UI says so.
- **Take-home** = taxable income − the employee's 401k contribution − taxes.
- **Totals:**
  - Year-1 total, 4-year total and average per year.
  - The difference from the `current` package, if it exists, for each.
  - PTO value = base / 260 × days, shown for information and not added to totals.
- **Equity scenarios:** 4-year equity value at multipliers 0, 1, 3 and 10 of the share value.
  - RSU: grant × m.
  - Options: max(0, share value × m − strike) × shares.
- **Market:** `MarketPosition(occupation, area, base)` for year 1.
- **Cost of living:** COL-adjusted year-1 total = total × RPP(home) / RPP(area).
- **Validation (errors):** values must not be negative; percentages must be 0–100; custom vesting must sum to 100; a `counter` needs a `parent_id`; a non-`current` package needs a `job_id`.

## 6. Source marking

Any value derived from an external dataset gets a muted superscript mark, `✦¹`, `✦²` or `✦³`:
- 1 = BLS OEWS
- 2 = BEA RPP
- 3 = tax tables

The `<SourceMark source detail>` component renders the mark, with a tooltip giving the release and the exact occupation, area or state used. The fallback level is named when one was used (e.g. *"state-level data: no metro figure for this occupation"*).

Any page that shows marked values ends with a small "Sources" footer listing each numbered source: full name, release, link, and the line *"Estimates, not tax or financial advice."*

## 7. UI

- **Offers page** (`/offers`, nav item "Offers"):
  - **Cards:** one card per package, scrolling horizontally. A checkbox chooses which are compared; the default is all offers plus current, and the choice is remembered.
  - **Card contents:** kind badge, company/label, year-1 total, 4-year average, year-1 take-home✦³, the difference vs. current, market percentile✦¹, and the COL-adjusted year-1 figure✦².
  - **Card actions:** edit, draft counter (offers only), delete.
- **Below the cards:**
  - **Chart:** a stacked bar per year per selected package (base / bonus / signing / equity / benefits), drawn as inline SVG with a legend.
  - **Breakdown table:** every line item for year 1 and the 4-year total, including each tax line✦³.
  - **Equity scenarios table:** shown when any selected package has equity.
  - **Market detail:** the p10–p90 range for each package's occupation and area, with a marker at the base✦¹.
- **Package editor modal:**
  - Sections: Cash, Equity, Benefits, Location & taxes.
  - Searchable occupation and area pickers.
  - The state is prefilled from the area.
  - A live year-1 preview.
- **Job detail page:** a "Compensation" panel lists the job's packages with Add offer / Add estimate / Open comparison.
- **Pipeline cards:** when a job has an offer package, the money chip shows "$X yr-1 total".
- **Settings:** filing status, home location (area picker), default occupation, and a "Current job" editor.

## 8. Testing

- **Python:** a test of the build script's output that checks known values, e.g. US Software Developers median = 135980 and Denver RPP = the CSV's 2024 value.
- **Go:**
  - Market lookups: interpolation, top-coding, fallbacks.
  - Tax:
    - Hand-checked cases: single at $100k in TX (no state tax), married at $250k in CA, above the SS wage base, the extra Medicare tax, a flat-tax state, 401k reducing income tax but not FICA.
    - Every state entry is present and well-formed.
  - Calculations: each vesting schedule, raises, options under water, counter difference, COL math, validation errors.
  - Repository: CRUD, the single-current rule, cascades.
- **Frontend (Vitest):** comp formatting helpers and source-mark detail text.
