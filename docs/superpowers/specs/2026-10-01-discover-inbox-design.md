# Discover Inbox — Design Spec

**Date:** 2026-10-01 · **Status:** Approved in chat · **Replaces:** the search-and-forget Discover flow from Phase 1

## 1. Purpose

Every posting any search finds is kept in a persistent inbox, so the same listings aren't re-scraped or shown again after the user has dealt with them.

- **Searches** are saved, cached, and re-scraped incrementally.
- **Results per board** are configurable.
- **"Not interested"** hides a posting permanently. It can be restored to the inbox or added to Interested from a "Not interested" tab.

## 2. Data (migration 3)

### `postings`

| Group | Columns |
|---|---|
| Identity | `id` · `dedupe_key` (unique: normalized company + title) · `url` (indexed) |
| Posting content | `title`, `company`, `location`, `work_mode`, `salary_min`, `salary_max`, `salary_text`, `annualized`, `description`, `date_posted`, `sources` (comma list) |
| State | `state` (`new` / `seen` / `saved` / `dismissed`) · `job_id` (FK to jobs, ON DELETE SET NULL) · `search_id` (FK to searches, ON DELETE SET NULL) |
| Timestamps | `first_seen`, `last_seen`, `dismissed_at` |

**Upsert rules** (for each scraped result):
- **Match:** an existing row is found by `dedupe_key`, or by a non-empty `url`.
- **Merge:** union the sources, fill empty fields, keep the longer description, take the salary if missing, update `last_seen`. **State is never changed by a re-scrape**, so dismissed stays dismissed.
- **New posting:** state `new`. If it already matches a pipeline job (same rule as today's "Tracking" badge), it gets state `saved` and that `job_id` instead.
- **Counted as new:** postings inserted with state `new`.

### `searches`

| Group | Columns |
|---|---|
| Identity | `id` · `query_key` (unique: normalized term, location, remote flag and sorted sources) |
| Query | `term`, `location`, `remote_only`, `sources` (csv), `per_source` (JSON object source → count) |
| Timestamps | `last_run_at`, `created_at` |

## 3. Search, cache and incremental scraping

`RunSearch(q, force)`:
1. Normalize the query and upsert its `searches` row (the latest per-source counts win).
2. **Cache hit:** if `!force`, `last_run_at` is within `Settings.DiscoverCacheHours` (default 12, range 0–168; 0 = never cache), and the source set is unchanged, return `{cached: true}` without scraping.
3. **Otherwise scrape incrementally:**
   - If there was a previous run, `hoursOld = ceil(hours since last_run_at) + 24` (the extra day absorbs posting-date lag), capped at 720.
   - If there was no previous run, `hoursOld = 0` (no limit).
   - JobSpy receives `--hours-old` when it's above 0. Adzuna receives `max_days_old = ceil(hoursOld / 24)`.
4. **Results per board:** `per_source[source]`, clamped to 5–100, default 20. JobSpy gets `--results`; Adzuna gets `results_per_page` (Adzuna's maximum is 50).
5. Upsert all results (§2), set `last_run_at`, and return `{searchId, cached, fetched, newCount, errors, lastRunAt}`.

## 4. Posting actions

- **`MarkPostingSeen(id)`:** `new` → `seen`. Called when a posting is opened in the preview.
- **`DismissPosting(id)`:** → `dismissed`, and stamps `dismissed_at`.
- **`RestorePosting(id)`:** `dismissed` → `seen`, and clears `dismissed_at`.
- **`SavePosting(id)`:**
  - Creates an Interested job with all the posting's fields (the same as today's `jobFromResult`).
  - Sets state to `saved` and stores the `job_id`.
  - Returns the job.
  - If the posting is already saved and its job still exists, it returns that job instead.
- **`ClearDismissed(olderThanDays)`:** deletes dismissed rows older than N days. The UI warns that cleared postings may reappear if they're still listed.
- **`ListPostings(filter)`:**
  - `filter = {tab: inbox|saved|dismissed, query, source, onlyNew}`.
  - `inbox` means `new` + `seen`, ordered newest-first (`first_seen DESC`).
  - The Interested tab includes the linked job's current status.
- **`InboxCounts()`:** `{new, inbox, saved, dismissed}` for the tab badges.
- **`ListRecentSearches(limit)`** and **`DeleteSearch(id)`**.

## 5. UI (Discover page rewrite)

- **Search form:**
  - Term, location, remote-only, a checkbox per source plus a **results-per-board number** (remembered in prefs), and a note that LinkedIn often blocks above ~25.
  - Buttons: **Search** (uses the cache) and **Refresh now** (forced).
  - Status line examples:
    - *"Showing saved results from 2h ago, nothing re-scraped."*
    - *"Fetched 48 postings, 12 new."*
    - Per-source errors appear in the existing warning banner.
- **Recent searches:** chips under the form (click to load and run; right-click: Run / Refresh now / Remove).
- **Tabs:** Inbox (count, plus a "N new" pill) · Interested · Not interested.
- **Inbox list:**
  - "New" badge on new postings.
  - Filters: text, source, only new.
  - Right-click: Add to Interested · Not interested · Open posting · Copy link.
- **Preview pane:** opening a posting marks it seen. Buttons: Add to Interested / Not interested / Original posting.
- **Not interested tab:**
  - Each posting shows its dismissed date.
  - Right-click and buttons: **Move back to inbox** · **Add to Interested** · Open posting.
  - The footer has "Clear older than 90 days", with a confirmation.
- **Interested tab:** shows the pipeline status. Right-click: Open job · Open posting.
- **Settings:** "Re-use search results for N hours".

## 6. Testing (Go)

- **Postings:**
  - A merge across searches gives one row with combined sources.
  - Dismissed survives a re-scrape.
  - A restore returns the posting to the inbox.
  - Saving creates the job and links it; saving twice returns the same job.
  - An auto-saved match against an existing pipeline job.
  - Clearing respects the age cutoff.
  - The tab filters return the right rows.
- **Searches:**
  - A cache hit within the window, and no hit when the source set changed.
  - `force` bypasses the cache.
  - `hoursOld` on a first run vs. a later run, including the cap.
  - Per-source clamping.
  - `RunSearch` with a fake fetcher: errors are kept per source, and `newCount` is correct.
- **Settings:** `DiscoverCacheHours` defaults to 12 and is validated (0–168).
