package main

import (
	"os"
	"path/filepath"
	"testing"
)

func TestSettingsDefaults(t *testing.T) {
	s, err := NewSettingsStore(t.TempDir()).Load()
	if err != nil || s.FollowUpDays != defaultFollowUpDays || s.PythonPath != "" || s.FilingStatus != "single" || s.HomeAreaCode != "US" {
		t.Fatalf("s = %+v, %v", s, err)
	}
}

func TestSettingsRoundTrip(t *testing.T) {
	dir := t.TempDir()
	store := NewSettingsStore(dir)
	want := Settings{AdzunaAppID: "id", AdzunaAppKey: "key", PythonPath: `C:\py\python.exe`, FollowUpDays: 10, FilingStatus: "married", HomeAreaCode: "19740", DefaultOccupation: "15-1252", WindowWidth: 1400, WindowHeight: 900, WindowMaximised: true}
	if err := store.Save(want); err != nil {
		t.Fatal(err)
	}
	got, err := store.Load()
	if err != nil || got != want {
		t.Fatalf("got %+v, %v", got, err)
	}
	if err := store.Save(Settings{}); err != nil {
		t.Fatal(err)
	}
	if got, _ := store.Load(); got.FollowUpDays != defaultFollowUpDays {
		t.Fatalf("zero follow-up days should default, got %d", got.FollowUpDays)
	}
	if matches, _ := filepath.Glob(filepath.Join(dir, "*.tmp")); len(matches) != 0 {
		t.Fatalf("temp files left behind: %v", matches)
	}
}

func TestSettingsRejectsHugeFollowUp(t *testing.T) {
	dir := t.TempDir()
	if err := NewSettingsStore(dir).Save(Settings{FilingStatus: "widowed"}); err == nil {
		t.Fatal("bad filing status should error")
	}
	if err := NewSettingsStore(dir).Save(Settings{FollowUpDays: 400}); err == nil {
		t.Fatal("expected error")
	}
	if _, err := os.Stat(filepath.Join(dir, "settings.json")); !os.IsNotExist(err) {
		t.Fatal("invalid settings should not be written")
	}
}
