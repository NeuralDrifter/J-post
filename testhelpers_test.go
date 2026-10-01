package main

import (
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
