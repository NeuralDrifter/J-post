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

// dateLayout is used for calendar dates (date applied, follow-up date), local time.
const dateLayout = "2006-01-02"

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
