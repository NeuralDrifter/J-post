package main

import (
	"database/sql"
	"os"
	"path/filepath"
	"testing"
)

func TestOpenDBCreatesSchema(t *testing.T) {
	r := newTestRepo(t)
	for _, table := range []string{"jobs", "stage_events", "contacts", "interviews", "attachments", "schema_version"} {
		var name string
		err := r.db.QueryRow(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`, table).Scan(&name)
		if err != nil {
			t.Errorf("table %s missing: %v", table, err)
		}
	}
	v, err := schemaVersion(r.db)
	if err != nil || v != len(migrations) {
		t.Fatalf("schema version = %d, %v; want %d", v, err, len(migrations))
	}
}

func TestForeignKeysEnabled(t *testing.T) {
	r := newTestRepo(t)
	var on int
	if err := r.db.QueryRow(`PRAGMA foreign_keys`).Scan(&on); err != nil || on != 1 {
		t.Fatalf("foreign_keys = %d, %v; want 1", on, err)
	}
}

func TestReopenIsIdempotentAndSkipsBackup(t *testing.T) {
	path := filepath.Join(t.TempDir(), "j.db")
	db, err := openDB(path)
	if err != nil {
		t.Fatal(err)
	}
	db.Close()
	db, err = openDB(path)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	if v, _ := schemaVersion(db); v != len(migrations) {
		t.Fatalf("version = %d", v)
	}
	if matches, _ := filepath.Glob(path + ".bak-*"); len(matches) != 0 {
		t.Fatalf("unexpected backups: %v", matches)
	}
}

func TestMigrationBacksUpExistingDB(t *testing.T) {
	path := filepath.Join(t.TempDir(), "m.db")
	first := []string{`CREATE TABLE a (x INTEGER); INSERT INTO a VALUES (42);`}
	db, err := openDBWith(path, first)
	if err != nil {
		t.Fatal(err)
	}
	db.Close()

	second := []string{first[0], `CREATE TABLE b (y INTEGER);`}
	db, err = openDBWith(path, second)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()

	backup := path + ".bak-v2"
	if _, err := os.Stat(backup); err != nil {
		t.Fatalf("backup missing: %v", err)
	}
	bdb, err := sql.Open("sqlite", backup)
	if err != nil {
		t.Fatal(err)
	}
	defer bdb.Close()
	var x int
	if err := bdb.QueryRow(`SELECT x FROM a`).Scan(&x); err != nil || x != 42 {
		t.Fatalf("backup data x = %d, %v", x, err)
	}
	var n int
	bdb.QueryRow(`SELECT COUNT(*) FROM sqlite_master WHERE name='b'`).Scan(&n)
	if n != 0 {
		t.Fatal("backup should predate migration 2")
	}
}

func TestFailedMigrationRollsBack(t *testing.T) {
	path := filepath.Join(t.TempDir(), "f.db")
	bad := []string{`CREATE TABLE ok (x INTEGER); CREATE TABLE ok (x INTEGER);`}
	if db, err := openDBWith(path, bad); err == nil {
		db.Close()
		t.Fatal("expected migration error")
	}
	db, err := sql.Open("sqlite", path)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	var n int
	db.QueryRow(`SELECT COUNT(*) FROM sqlite_master WHERE name='ok'`).Scan(&n)
	if n != 0 {
		t.Fatal("partial migration was not rolled back")
	}
}
