# Discover Inbox — Implementation Plan

> Compact plan (user preference). REQUIRED SUB-SKILL: superpowers:executing-plans. Go tasks are TDD.

**Spec:** `docs/superpowers/specs/2026-10-01-discover-inbox-design.md`
**Constraints:** All earlier Global Constraints apply (SetMaxOpenConns(1), lists never nil, `api()` + `notifyDataChanged()`, Lumina tokens, right-click via `openMenu`).

## Review Focus

1. **Same posting returned by two boards in one scrape, or across two searches.** Expected: one row, with its sources merged. Test: `TestUpsertMergesAcrossSearches`.
2. **A dismissed posting comes back in a later scrape.** Expected: it stays dismissed and hidden. Test: `TestDismissSurvivesRescrape`.
3. **The pipeline job behind a saved posting is deleted.** Expected: the posting stays `saved` with `job_id` NULL, and does not reappear in the inbox. Test: `TestSavedPostingAfterJobDeleted`.
4. **A search run again with a different source set or board counts.** Expected: a new source set is not a cache hit; the latest counts are stored. Test: `TestSearchCacheRules`.
5. **The first scrape vs. a scrape weeks later.** Expected: `hoursOld` is 0 the first time and capped at 720 later. Test: `TestHoursOld`.

### Task 1: Postings storage (migration 3)

**Files:** `db.go` (migration 3: `searches` and `postings`), `postings.go`, `postings_test.go`.

**Produces:**
- `type Posting` (JSON in camelCase, plus `JobStatus string`).
- `(r *Repo) UpsertPostings(results []DiscoverResult, searchID string) (newCount int, err error)`
- `ListPostings(PostingFilter) ([]Posting, error)`, `InboxCounts() (InboxCounts, error)`
- `MarkPostingSeen`, `DismissPosting`, `RestorePosting`, `SavePosting(id) (Job, error)`
- `ClearDismissed(olderThanDays int) (int, error)`

**Tests:** the five Review Focus items that relate to postings, plus `TestPostingTabsAndFilters`, `TestSavePostingTwice`, `TestClearDismissed`, and `TestAutoSavedWhenAlreadyTracked`.

### Task 2: Searches, cache, incremental scrape

**Files:** `searches.go`, `searches_test.go`; modify `discover.go`, `scraper.py` and `settings.go`.

**Produces:**
- `type SearchQuery {Term, Location string; RemoteOnly bool; Sources []string; PerSource map[string]int}`
- `type SavedSearch`
- `(r *Repo) UpsertSearch(q) (SavedSearch, error)`, `ListRecentSearches(limit)`, `DeleteSearch(id)`, `markSearchRun(id, at)`
- `hoursOld(last string, now time.Time) int`, `perSourceCount(q, source) int`, `cacheHit(s SavedSearch, q, now, hours) bool`
- `RunSearch(ctx, r, q, force, settings, fetch sourceFunc) (SearchRun, error)`

**Changes elsewhere:**
- `sourceFunc` now takes a `fetchOptions{Results, HoursOld int}`.
- `scraper.py` accepts `--hours-old`.
- `adzunaSearch` takes `results_per_page` and `max_days_old`.
- `Settings.DiscoverCacheHours`: default 12, valid range 0–168.
- `runDiscover` is reused to fetch and merge; its results then go through `UpsertPostings`.

**Tests:**
- `TestSearchCacheRules`, `TestHoursOld`, `TestPerSourceClamp`.
- `TestRunSearchFakeFetcher`: the cached path, the forced path, per-source errors and `newCount`.
- The settings defaults.

### Task 3: App bindings

- **Replace** `App.Discover` with `RunSearch(q, force)`.
- **Add:** `ListPostings`, `InboxCounts`, `MarkPostingSeen`, `DismissPosting`, `RestorePosting`, `SavePosting`, `ClearDismissed`, `ListRecentSearches`, `DeleteSearch`.
- Regenerate the bindings.
- `go test` must pass and `tsc` must still compile. Old Discover UI calls are removed in Task 4, so this task temporarily stubs `DiscoverPage`'s search call to keep the build green.

### Task 4: Discover page rewrite

**Files:** `pages/Discover/{DiscoverPage,SearchForm,RecentSearches,PostingList,PreviewPane}.tsx`; remove `ResultsList.tsx` and the `jobFromResult` usage (keep the function and its test only if still used); `SettingsPage` (cache hours).

**Behavior:** as described in spec §5. Right-click menus are on postings, recent-search chips and the Not interested rows.

### Task 5: Verify and document

Run `go vet`, `go test`, `npm test`, `npm run build` and `wails build`. Update the README's Discover section. Hand off to the user for a manual run.
