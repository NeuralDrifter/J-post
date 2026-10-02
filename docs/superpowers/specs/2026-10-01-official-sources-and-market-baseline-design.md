# Official Job Sources + Market Baseline — Design Spec

**Date:** 2026-10-01 · **Status:** Approved in chat

## 1. Market baseline for offers

When no `current` package exists, each package compares its **base salary** with the BLS OEWS median (p50) for `Settings.DefaultOccupation` in `Settings.HomeAreaCode`. The usual area → state → national fallback applies.

- **Base, not total comp:** OEWS wages exclude stock, benefits and most bonuses, so the comparison uses base salary only.
- **Result field:** `PackageResult.MarketBaseline {OccTitle, AreaTitle, Level, Median, BaseDelta}`, ✦¹ marked in the UI.
- **When it's absent:**
  - A current package exists (that baseline wins).
  - No default occupation is set.
  - The median is top-coded or unpublished.
- **UI:** cards show "±$X base vs typical {occupation} in {area}". When no occupation is set, a hint links to Settings. The breakdown table gets a "Base vs typical (BLS median)" row.

## 2. Official sources

New Discover sources, each mapped to the existing `rawJob` and merged and de-duplicated like the others:

| Source | Endpoint | Auth | Search | Rules we must follow |
|---|---|---|---|---|
| `usajobs` | `GET https://data.usajobs.gov/api/search` | Headers `Host: data.usajobs.gov`, `User-Agent: <email>`, `Authorization-Key: <key>` | `Keyword`, `LocationName`, `ResultsPerPage` (≤500), `DatePosted` (days, 0–60), `RemoteIndicator=True` when remote-only | Federal jobs only |
| `himalayas` | `GET https://himalayas.app/jobs/api/search?q=&page=` | none | keyword, 20 per page (page until the count is met, max 5 pages) | Link to the Himalayas URL (`guid`) and credit Himalayas; no re-posting to other boards; 429 → "rate-limited, try later" |
| `jobicy` | `GET https://jobicy.com/api/v2/remote-jobs?count=&tag=` | none | `tag` keyword, count ≤ 200 (we use the per-board count) | Keep the Jobicy URL and credit Jobicy; **at most one call per hour** (enforced, shared across all searches) |
| `themuse` | `GET https://www.themuse.com/api/public/jobs?page=&category=&location=` | none (500 req/hr) | **none server-side**: slices are copied locally and searched locally | Polite paging; slows down when `X-RateLimit-Remaining` < 10 |

All four are remote-friendly. Himalayas and Jobicy list only remote jobs.

### Field mapping

| Source | Title / company | Location | URL | Date | Salary | Description |
|---|---|---|---|---|---|---|
| USAJobs | `PositionTitle` / `OrganizationName` | `PositionLocationDisplay` | `PositionURI` | `PublicationStartDate` | First `PositionRemuneration` | `UserArea.Details.JobSummary` |
| Himalayas | `title` / `companyName` | `locationRestrictions` joined, or "Remote" | `guid` | `pubDate` (unix seconds) | `minSalary` / `maxSalary`, yearly, only when currency is USD or empty | `description` (HTML) |
| Jobicy | `jobTitle` / `companyName` | `jobGeo` | `url` | `pubDate` (first 10 characters) | `salaryMin` / `salaryMax` (or `annualSalaryMin` / `annualSalaryMax`), `salaryPeriod` default yearly, USD only | `jobDescription` (HTML) |
| The Muse | `name` / `company.name` | `locations[].name` joined | `refs.landing_page` | `publication_date` | none | `contents` (HTML) |

- **USAJobs pay interval** (`RateIntervalCode`): `PA` yearly, `PH` hourly, `PD` daily, `PW` weekly, `BW` biweekly (×26), `PM` monthly.
- **HTML descriptions** are converted to plain markdown-ish text: block tags become newlines, list items become "- ", and entities are decoded.
- **The search form** only lists sources it knows (`knownSources`).

### The Muse local slices

- **A slice** is one category × one Muse location. Categories come from `Settings.MuseCategories`, picked from The Muse's documented list.
- **The location** is the search location, normalized to "City, ST". If the location is empty or remote-only is set, it's "Flexible / Remote".
- **Sync** happens when a slice is older than 24 hours:
  - Fetch every page, capped at 100 pages (2,000 jobs), with a 300 ms pause between pages.
  - Replace the slice's rows in `muse_jobs`, and record `muse_slices.synced_at` and the total.
- **Local search:**
  - Every word of the search term must appear in the title, company or description (case-insensitive).
  - Results are ordered by `publication_date` DESC, limited to the per-board count.
  - When `hoursOld` > 0, only postings within that window are kept.
- **Not set up yet:** if no categories are configured, the source reports "Pick The Muse categories in Settings".
- **Location not on The Muse:** if the location matches no Muse slice (the total is 0), the source reports "The Muse has no '{location}' listings for these categories".

### Cooldowns and new settings

- **Cooldowns:** table `source_calls(source PK, last_called_at)`. Jobicy is skipped with an explanatory error if it was called less than 60 minutes ago.
- **New settings:** `usajobsKey`, `usajobsEmail`, `museCategories []string`.
- **Disabled sources:** the search form disables USAJobs until its key and email are set, and The Muse until categories are picked. It shows why.

### Search form layout

Two rows:
- **Official APIs:** Adzuna, USAJobs, Himalayas, Jobicy, The Muse.
- **Scraped via JobSpy:** Indeed, LinkedIn, ZipRecruiter.

Himalayas and Jobicy are labeled "remote only".

## 3. Data (migration 5)

- `source_calls` (see §2).
- `muse_slices(slice_key PK, category, location, synced_at, total)`.
- `muse_jobs(muse_id, slice_key, title, company, locations, levels, publication_date, url, description, PRIMARY KEY(muse_id, slice_key))`, with an index on `slice_key`.

## 4. Testing (Go, fake HTTP servers)

- **Each client:**
  - Field mapping.
  - Required headers or parameters are sent.
  - Paging (Himalayas, The Muse).
  - Errors never contain keys.
  - 429 handling (Himalayas).
- **Rules:**
  - The Jobicy cooldown.
  - The Muse: slice sync, then local AND-word search; the 24-hour reuse; the "no categories" error; the empty-slice error.
- **HTML to text:** a dedicated test.
- **Market baseline:** shown when there's no current package, absent when one exists, absent when no default occupation, and top-coded handling.
