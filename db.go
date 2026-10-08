// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

package main

import (
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"errors"
	"fmt"
	"os"
	"strings"
	"time"

	_ "modernc.org/sqlite"
)

// ErrNotFound is wrapped by every lookup that finds no matching row.
var ErrNotFound = errors.New("not found")

// tsLayout matches JavaScript's Date.toISOString(), so the frontend and backend
// exchange timestamps without conversion. Always UTC.
const tsLayout = "2006-01-02T15:04:05.000Z"

func ts(t time.Time) string { return t.UTC().Format(tsLayout) }

func newID() string {
	b := make([]byte, 8)
	if _, err := rand.Read(b); err != nil {
		return fmt.Sprintf("%x", time.Now().UnixNano())
	}
	return hex.EncodeToString(b)
}

type rowScanner interface {
	Scan(dest ...any) error
}

type execer interface {
	Exec(query string, args ...any) (sql.Result, error)
}

type querier interface {
	QueryRow(query string, args ...any) *sql.Row
}

// keyValue is one row of a two-column "key, value" query (e.g. a GROUP BY count).
type keyValue[V any] struct {
	key   string
	value V
}

func scanKeyValue[V any](s rowScanner) (keyValue[V], error) {
	var kv keyValue[V]
	err := s.Scan(&kv.key, &kv.value)
	return kv, err
}

// queryAll runs a query and scans every row with scan. It returns an empty
// (non-nil) slice when nothing matches, so the frontend gets [] rather than null.
func queryAll[T any](db *sql.DB, scan func(rowScanner) (T, error), query string, args ...any) ([]T, error) {
	rows, err := db.Query(query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []T{}
	for rows.Next() {
		v, err := scan(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, v)
	}
	return out, rows.Err()
}

func nullInt(p *int64) any {
	if p == nil {
		return nil
	}
	return *p
}

// expectOneRow turns "0 rows affected" into a wrapped ErrNotFound.
func expectOneRow(res sql.Result, err error, what, id string) error {
	if err != nil {
		return err
	}
	n, err := res.RowsAffected()
	if err != nil {
		return err
	}
	if n == 0 {
		return fmt.Errorf("%s %s: %w", what, id, ErrNotFound)
	}
	return nil
}

// Repo is the data layer. now is replaceable so tests can fix the clock.
type Repo struct {
	db       *sql.DB
	filesDir string
	now      func() time.Time
	kept     keptPlans // question plans kept for Try again (see prepareInterview)
}

func NewRepo(db *sql.DB, filesDir string) *Repo {
	return &Repo{db: db, filesDir: filesDir, now: time.Now}
}

// migrations are applied in order; migration N is migrations[N-1]. Never edit
// a shipped migration — append a new one.
var migrations = []string{
	`CREATE TABLE jobs (
		id TEXT PRIMARY KEY,
		company TEXT NOT NULL,
		position TEXT NOT NULL,
		status TEXT NOT NULL,
		close_reason TEXT NOT NULL DEFAULT '',
		location TEXT NOT NULL DEFAULT '',
		work_mode TEXT NOT NULL DEFAULT '',
		salary_min INTEGER,
		salary_max INTEGER,
		salary_text TEXT NOT NULL DEFAULT '',
		url TEXT NOT NULL DEFAULT '',
		source TEXT NOT NULL DEFAULT 'manual',
		description TEXT NOT NULL DEFAULT '',
		date_posted TEXT NOT NULL DEFAULT '',
		date_applied TEXT NOT NULL DEFAULT '',
		follow_up_on TEXT NOT NULL DEFAULT '',
		notes TEXT NOT NULL DEFAULT '',
		created_at TEXT NOT NULL,
		updated_at TEXT NOT NULL
	);
	CREATE TABLE stage_events (
		id TEXT PRIMARY KEY,
		job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
		from_status TEXT,
		to_status TEXT NOT NULL,
		close_reason TEXT NOT NULL DEFAULT '',
		at TEXT NOT NULL,
		note TEXT NOT NULL DEFAULT ''
	);
	CREATE INDEX idx_stage_events_job ON stage_events(job_id, at);
	CREATE TABLE contacts (
		id TEXT PRIMARY KEY,
		job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
		name TEXT NOT NULL,
		role TEXT NOT NULL DEFAULT '',
		email TEXT NOT NULL DEFAULT '',
		phone TEXT NOT NULL DEFAULT '',
		linkedin_url TEXT NOT NULL DEFAULT '',
		notes TEXT NOT NULL DEFAULT ''
	);
	CREATE INDEX idx_contacts_job ON contacts(job_id);
	CREATE TABLE interviews (
		id TEXT PRIMARY KEY,
		job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
		kind TEXT NOT NULL,
		scheduled_at TEXT NOT NULL,
		duration_min INTEGER NOT NULL DEFAULT 0,
		location_or_link TEXT NOT NULL DEFAULT '',
		notes TEXT NOT NULL DEFAULT '',
		completed INTEGER NOT NULL DEFAULT 0
	);
	CREATE INDEX idx_interviews_job ON interviews(job_id);
	CREATE INDEX idx_interviews_scheduled ON interviews(scheduled_at);
	CREATE TABLE attachments (
		id TEXT PRIMARY KEY,
		job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
		label TEXT NOT NULL,
		file_name TEXT NOT NULL,
		stored_path TEXT NOT NULL,
		added_at TEXT NOT NULL
	);
	CREATE INDEX idx_attachments_job ON attachments(job_id);`,
	// 2: compensation packages (offers, estimates, counters, current job).
	`CREATE TABLE comp_packages (
		id TEXT PRIMARY KEY,
		job_id TEXT REFERENCES jobs(id) ON DELETE CASCADE,
		kind TEXT NOT NULL,
		label TEXT NOT NULL DEFAULT '',
		parent_id TEXT REFERENCES comp_packages(id) ON DELETE SET NULL,
		base_salary INTEGER NOT NULL DEFAULT 0,
		signing_bonus INTEGER NOT NULL DEFAULT 0,
		signing_clawback_months INTEGER NOT NULL DEFAULT 0,
		target_bonus_pct REAL NOT NULL DEFAULT 0,
		annual_raise_pct REAL NOT NULL DEFAULT 0,
		equity_type TEXT NOT NULL DEFAULT 'none',
		rsu_grant_value INTEGER NOT NULL DEFAULT 0,
		option_shares INTEGER NOT NULL DEFAULT 0,
		option_strike REAL NOT NULL DEFAULT 0,
		share_value REAL NOT NULL DEFAULT 0,
		vesting TEXT NOT NULL DEFAULT 'standard',
		vesting_custom TEXT NOT NULL DEFAULT '',
		k401_match_pct REAL NOT NULL DEFAULT 0,
		k401_match_cap_pct REAL NOT NULL DEFAULT 0,
		k401_contrib_pct REAL NOT NULL DEFAULT 0,
		health_premium_annual INTEGER NOT NULL DEFAULT 0,
		stipends_annual INTEGER NOT NULL DEFAULT 0,
		other_annual INTEGER NOT NULL DEFAULT 0,
		pto_days INTEGER NOT NULL DEFAULT 0,
		occupation_code TEXT NOT NULL DEFAULT '',
		area_code TEXT NOT NULL DEFAULT '',
		tax_state TEXT NOT NULL DEFAULT '',
		local_tax_pct REAL NOT NULL DEFAULT 0,
		notes TEXT NOT NULL DEFAULT '',
		created_at TEXT NOT NULL,
		updated_at TEXT NOT NULL
	);
	CREATE INDEX idx_comp_job ON comp_packages(job_id);
	CREATE UNIQUE INDEX idx_comp_one_current ON comp_packages(kind) WHERE kind = 'current';`,
	// 3: Discover inbox — saved searches and every posting they found.
	`CREATE TABLE searches (
		id TEXT PRIMARY KEY,
		query_key TEXT NOT NULL UNIQUE,
		term TEXT NOT NULL,
		location TEXT NOT NULL DEFAULT '',
		remote_only INTEGER NOT NULL DEFAULT 0,
		sources TEXT NOT NULL DEFAULT '',
		per_source TEXT NOT NULL DEFAULT '{}',
		last_run_at TEXT NOT NULL DEFAULT '',
		created_at TEXT NOT NULL
	);
	CREATE TABLE postings (
		id TEXT PRIMARY KEY,
		dedupe_key TEXT NOT NULL UNIQUE,
		url TEXT NOT NULL DEFAULT '',
		title TEXT NOT NULL,
		company TEXT NOT NULL DEFAULT '',
		location TEXT NOT NULL DEFAULT '',
		work_mode TEXT NOT NULL DEFAULT '',
		salary_min INTEGER,
		salary_max INTEGER,
		salary_text TEXT NOT NULL DEFAULT '',
		annualized INTEGER NOT NULL DEFAULT 0,
		description TEXT NOT NULL DEFAULT '',
		date_posted TEXT NOT NULL DEFAULT '',
		sources TEXT NOT NULL DEFAULT '',
		state TEXT NOT NULL DEFAULT 'new',
		job_id TEXT REFERENCES jobs(id) ON DELETE SET NULL,
		search_id TEXT REFERENCES searches(id) ON DELETE SET NULL,
		first_seen TEXT NOT NULL,
		last_seen TEXT NOT NULL,
		dismissed_at TEXT NOT NULL DEFAULT ''
	);
	CREATE INDEX idx_postings_url ON postings(url);
	CREATE INDEX idx_postings_state ON postings(state, first_seen);`,
	// 4: the first pipeline stage is called "interested" (was "wishlist").
	`UPDATE jobs SET status = 'interested' WHERE status = 'wishlist';
	UPDATE stage_events SET to_status = 'interested' WHERE to_status = 'wishlist';
	UPDATE stage_events SET from_status = 'interested' WHERE from_status = 'wishlist';`,
	// 5: per-source call log (rate limits) and the local copy of The Muse slices.
	`CREATE TABLE source_calls (
		source TEXT PRIMARY KEY,
		last_called_at TEXT NOT NULL
	);
	CREATE TABLE muse_slices (
		slice_key TEXT PRIMARY KEY,
		category TEXT NOT NULL,
		location TEXT NOT NULL,
		synced_at TEXT NOT NULL,
		total INTEGER NOT NULL DEFAULT 0
	);
	CREATE TABLE muse_jobs (
		muse_id INTEGER NOT NULL,
		slice_key TEXT NOT NULL,
		title TEXT NOT NULL,
		company TEXT NOT NULL DEFAULT '',
		locations TEXT NOT NULL DEFAULT '',
		levels TEXT NOT NULL DEFAULT '',
		publication_date TEXT NOT NULL DEFAULT '',
		url TEXT NOT NULL DEFAULT '',
		description TEXT NOT NULL DEFAULT '',
		PRIMARY KEY (muse_id, slice_key)
	);
	CREATE INDEX idx_muse_jobs_slice ON muse_jobs(slice_key, publication_date);`,
	// 6: AI — the user's resume and mock interview sessions.
	`CREATE TABLE profile (
		id INTEGER PRIMARY KEY CHECK (id = 1),
		resume_file_name TEXT NOT NULL DEFAULT '',
		resume_path TEXT NOT NULL DEFAULT '',
		resume_text TEXT NOT NULL DEFAULT '',
		updated_at TEXT NOT NULL DEFAULT ''
	);
	INSERT INTO profile (id) VALUES (1);
	CREATE TABLE mock_interviews (
		id TEXT PRIMARY KEY,
		job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
		kind TEXT NOT NULL,
		minutes INTEGER NOT NULL,
		persona TEXT NOT NULL,
		voice TEXT NOT NULL DEFAULT '',
		focus TEXT NOT NULL DEFAULT '',
		status TEXT NOT NULL DEFAULT 'live',
		started_at TEXT NOT NULL,
		ended_at TEXT NOT NULL DEFAULT '',
		transcript TEXT NOT NULL DEFAULT '[]',
		scorecard TEXT NOT NULL DEFAULT '',
		recording_path TEXT NOT NULL DEFAULT '',
		error TEXT NOT NULL DEFAULT ''
	);
	CREATE INDEX idx_mock_interviews_job ON mock_interviews(job_id, started_at);`,
	// 7: the interviewer's name (matched to the voice).
	`ALTER TABLE mock_interviews ADD COLUMN interviewer_name TEXT NOT NULL DEFAULT '';`,
	// 8: one scorecard per grading provider, and saved coaching tips. Existing
	// scorecards came from Gemini Live.
	`CREATE TABLE scorecards (
		id TEXT PRIMARY KEY,
		mock_interview_id TEXT NOT NULL REFERENCES mock_interviews(id) ON DELETE CASCADE,
		provider TEXT NOT NULL,
		model TEXT NOT NULL DEFAULT '',
		scorecard TEXT NOT NULL,
		created_at TEXT NOT NULL,
		UNIQUE (mock_interview_id, provider)
	);
	CREATE TABLE interview_tips (
		id TEXT PRIMARY KEY,
		mock_interview_id TEXT NOT NULL REFERENCES mock_interviews(id) ON DELETE CASCADE,
		answer_at_ms INTEGER NOT NULL,
		kind TEXT NOT NULL,
		text TEXT NOT NULL,
		provider TEXT NOT NULL,
		model TEXT NOT NULL DEFAULT '',
		created_at TEXT NOT NULL
	);
	CREATE INDEX idx_interview_tips_interview ON interview_tips(mock_interview_id, answer_at_ms);
	INSERT INTO scorecards (id, mock_interview_id, provider, model, scorecard, created_at)
		SELECT lower(hex(randomblob(8))), id, 'gemini-live', '', scorecard,
			CASE WHEN ended_at != '' THEN ended_at ELSE started_at END
		FROM mock_interviews WHERE scorecard != '';
	ALTER TABLE mock_interviews DROP COLUMN scorecard;`,
	// 9: question plans written before an interview; retries share their plan.
	`CREATE TABLE interview_plans (
		id TEXT PRIMARY KEY,
		job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
		kind TEXT NOT NULL,
		minutes INTEGER NOT NULL,
		provider TEXT NOT NULL,
		model TEXT NOT NULL DEFAULT '',
		plan TEXT NOT NULL,
		created_at TEXT NOT NULL
	);
	ALTER TABLE mock_interviews ADD COLUMN plan_id TEXT NOT NULL DEFAULT '';
	CREATE INDEX idx_mock_interviews_plan ON mock_interviews(plan_id, started_at);`,
}

func openDB(path string) (*sql.DB, error) {
	return openDBWith(path, migrations)
}

func openDBWith(path string, list []string) (*sql.DB, error) {
	db, err := sql.Open("sqlite", path+"?_pragma=foreign_keys(1)&_pragma=journal_mode(WAL)&_pragma=busy_timeout(5000)")
	if err != nil {
		return nil, err
	}
	// One connection: a desktop app has a single user, and it keeps
	// transactions and pragmas simple. Never query r.db while a tx is open.
	db.SetMaxOpenConns(1)
	if err := db.Ping(); err != nil {
		db.Close()
		return nil, fmt.Errorf("open database %s: %w", path, err)
	}
	if err := migrate(db, path, list); err != nil {
		db.Close()
		return nil, fmt.Errorf("migrate database %s: %w", path, err)
	}
	return db, nil
}

func schemaVersion(db *sql.DB) (int, error) {
	var v int
	err := db.QueryRow(`SELECT COALESCE(MAX(version), 0) FROM schema_version`).Scan(&v)
	return v, err
}

func migrate(db *sql.DB, path string, list []string) error {
	if _, err := db.Exec(`CREATE TABLE IF NOT EXISTS schema_version (version INTEGER NOT NULL)`); err != nil {
		return err
	}
	current, err := schemaVersion(db)
	if err != nil {
		return err
	}
	for i := current; i < len(list); i++ {
		n := i + 1
		if current > 0 {
			if err := backupDB(db, fmt.Sprintf("%s.bak-v%d", path, n)); err != nil {
				return fmt.Errorf("backup before migration %d: %w", n, err)
			}
		}
		if err := applyMigration(db, n, list[i]); err != nil {
			return err
		}
	}
	return nil
}

func applyMigration(db *sql.DB, n int, stmt string) error {
	tx, err := db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if _, err := tx.Exec(stmt); err != nil {
		return fmt.Errorf("migration %d: %w", n, err)
	}
	if _, err := tx.Exec(`DELETE FROM schema_version`); err != nil {
		return err
	}
	if _, err := tx.Exec(`INSERT INTO schema_version (version) VALUES (?)`, n); err != nil {
		return err
	}
	return tx.Commit()
}

// backupDB writes a consistent copy (including WAL contents) to dest.
func backupDB(db *sql.DB, dest string) error {
	if err := os.Remove(dest); err != nil && !errors.Is(err, os.ErrNotExist) {
		return err
	}
	_, err := db.Exec(`VACUUM INTO '` + strings.ReplaceAll(dest, "'", "''") + `'`)
	return err
}
