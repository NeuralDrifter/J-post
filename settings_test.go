package main

import (
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
)

func TestSettingsDefaults(t *testing.T) {
	s, err := NewSettingsStore(t.TempDir()).Load()
	if err != nil || s.FollowUpDays != defaultFollowUpDays || s.PythonPath != "" || s.FilingStatus != "single" || s.HomeAreaCode != "US" || s.DiscoverCacheHours != 12 || s.GeminiLiveModel != "gemini-3.8-live" {
		t.Fatalf("s = %+v, %v", s, err)
	}
}

func TestSettingsRoundTrip(t *testing.T) {
	dir := t.TempDir()
	store := NewSettingsStore(dir)
	want := Settings{AdzunaAppID: "id", AdzunaAppKey: "key", PythonPath: `C:\py\python.exe`, FollowUpDays: 10, FilingStatus: "married", HomeAreaCode: "19740", DefaultOccupation: "15-1252", DiscoverCacheHours: 24, USAJobsKey: "k", USAJobsEmail: "me@example.test", MuseCategories: []string{"Software Engineering"}, GeminiKey: "g", GeminiLiveModel: "m2", GradingProvider: providerGeminiLive, TipsProvider: providerGeminiLive, PlanProvider: providerAnthropic, AnthropicKey: "a", AnthropicModel: "claude-sonnet-5-5", AnthropicGradingEffort: "max", AnthropicTipsEffort: "medium", ClaudeCodePath: `C:\tools\claude.exe`, ClaudeCodeModel: "sonnet"}
	if err := store.Save(want); err != nil {
		t.Fatal(err)
	}
	got, err := store.Load()
	if err != nil || !reflect.DeepEqual(got, want) {
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
	if err := NewSettingsStore(dir).Save(Settings{USAJobsKey: "k", USAJobsEmail: "nope"}); err == nil {
		t.Fatal("a USAJobs key needs a real email")
	}
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

func TestSettingsAIDefaults(t *testing.T) {
	dir := t.TempDir()
	// An older settings file without any of the AI provider fields.
	os.WriteFile(filepath.Join(dir, "settings.json"), []byte(`{"followUpDays": 7, "geminiKey": "g"}`), 0o600)
	s, err := NewSettingsStore(dir).Load()
	if err != nil {
		t.Fatal(err)
	}
	if s.GradingProvider != providerGeminiLive || s.TipsProvider != providerGeminiLive || s.AnthropicModel != "claude-opus-5-5" ||
		s.AnthropicGradingEffort != "high" || s.AnthropicTipsEffort != "low" || s.ClaudeCodePath != "" || s.ClaudeCodeModel != "" {
		t.Fatalf("s = %+v", s)
	}
}

func TestSettingsRejectsBadAIValues(t *testing.T) {
	store := NewSettingsStore(t.TempDir())
	for name, s := range map[string]Settings{
		"unknown grading provider": {GradingProvider: "skynet"},
		"unknown tips provider":    {TipsProvider: "skynet"},
		"unknown grading effort":   {AnthropicGradingEffort: "extreme"},
		"unknown tips effort":      {AnthropicTipsEffort: "tiny"},
	} {
		if err := store.Save(s); err == nil {
			t.Errorf("%s should be rejected", name)
		}
	}
}

func TestPlanProviderDefaultsToGeminiLive(t *testing.T) {
	dir := t.TempDir()
	os.WriteFile(filepath.Join(dir, "settings.json"), []byte(`{"followUpDays": 7}`), 0o600)
	s, err := NewSettingsStore(dir).Load()
	if err != nil || s.PlanProvider != providerGeminiLive {
		t.Fatalf("PlanProvider = %q, %v", s.PlanProvider, err)
	}
}

func TestPlanProviderMustBeKnown(t *testing.T) {
	err := NewSettingsStore(t.TempDir()).Save(Settings{PlanProvider: "nope"})
	if err == nil || !strings.Contains(err.Error(), `unknown AI provider "nope"`) {
		t.Fatalf("err = %v", err)
	}
}
