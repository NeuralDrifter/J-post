// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

package app

import (
	"database/sql"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"
	"time"
)

// newTestRepo opens a fresh migrated database in a temp dir with the clock fixed
// at 2026-10-01 12:00 local time (a Thursday).
func newTestRepo(t *testing.T) *Repo {
	t.Helper()
	dir := t.TempDir()
	db, err := openDB(filepath.Join(dir, "test.db"))
	if err != nil {
		t.Fatalf("openDB: %v", err)
	}
	t.Cleanup(func() { db.Close() })
	r := NewRepo(db, filepath.Join(dir, "files"))
	setNow(r, 2026, time.October, 1, 12)
	return r
}

// setNow fixes the repo clock to the given local date and hour.
func setNow(r *Repo, y int, m time.Month, d, hour int) {
	fixed := time.Date(y, m, d, hour, 0, 0, 0, time.Local)
	r.now = func() time.Time { return fixed }
}

func fakeServer(t *testing.T, handler http.HandlerFunc) string {
	srv := httptest.NewServer(handler)
	t.Cleanup(srv.Close)
	return srv.URL
}

// insertV1Job adds a job with plain SQL, using only the columns of the first
// schema, for tests that build data at an older schema version.
func insertV1Job(t *testing.T, db *sql.DB) Job {
	t.Helper()
	job := Job{ID: newID(), Company: "Acme", Position: "Dev", Status: StatusInterested}
	_, err := db.Exec(`INSERT INTO jobs (id, company, position, status, created_at, updated_at) VALUES (?, ?, ?, ?, '2026-10-01T12:00:00.000Z', '2026-10-01T12:00:00.000Z')`,
		job.ID, job.Company, job.Position, job.Status)
	if err != nil {
		t.Fatal(err)
	}
	return job
}
