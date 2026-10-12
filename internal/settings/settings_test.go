// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

package settings

import (
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
)

func TestSettingsDefaults(t *testing.T) {
	s, err := NewSettingsStore(t.TempDir()).Load()
	if err != nil || s.FollowUpDays != DefaultFollowUpDays || s.PythonPath != "" || s.FilingStatus != "single" || s.HomeAreaCode != "US" || s.DiscoverCacheHours != 12 || s.GeminiLiveModel != "gemini-3.8-live" {
		t.Fatalf("s = %+v, %v", s, err)
	}
}

func TestSettingsRoundTrip(t *testing.T) {
	dir := t.TempDir()
	store := NewSettingsStore(dir)
	want := Settings{AdzunaAppID: "id", AdzunaAppKey: "key", PythonPath: `C:\py\python.exe`, FollowUpDays: 10, FilingStatus: "married", HomeAreaCode: "19740", DefaultOccupation: "15-1252", DiscoverCacheHours: 24, USAJobsKey: "k", USAJobsEmail: "me@example.test", MuseCategories: []string{"Software Engineering"}, GeminiKey: "g", GeminiLiveModel: "m2", AnthropicKey: "a", AnthropicModel: "claude-sonnet-5-5", ClaudeCodePath: `C:\tools\claude.exe`, ClaudeCodeModel: "sonnet",
		OpenAIKey: "ok", OpenAIModel: "om", DeepSeekKey: "dk", DeepSeekModel: "dm", OllamaURL: "http://box:11434/v1", OllamaModel: "lm",
		LMStudioURL: "http://box:1234/v1", LMStudioKey: "lk", LMStudioModel: "sm",
		CustomAIBaseURL: "http://c/v1", CustomAIKey: "ck", CustomAIModel: "cm", CustomAIMode: "json_object",
		MatchEnabled: true, MatchPerRequest: 10, MatchMinSalary: 100000,
		MatchWorkModes: []string{"remote"}, MatchLocations: "Denver, CO", MatchSeniority: "staff", MatchGoals: "climate"}
	ApplyDefaults(&want)
	want.AIFeatures[TaskInterviewPlan] = AIChoice{Provider: ProviderAnthropic, Model: "claude-sonnet-5-5", Effort: "max"}
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
	if got, _ := store.Load(); got.FollowUpDays != DefaultFollowUpDays {
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

func TestAIFeatureDefaults(t *testing.T) {
	dir := t.TempDir()
	os.WriteFile(filepath.Join(dir, "settings.json"), []byte(`{"followUpDays": 7, "geminiKey": "g"}`), 0o600)
	s, err := NewSettingsStore(dir).Load()
	if err != nil {
		t.Fatal(err)
	}
	if len(s.AIFeatures) != len(AITasks) {
		t.Fatalf("AIFeatures = %+v", s.AIFeatures)
	}
	for _, task := range AITasks {
		if got := s.AIChoice(task.ID); got.Provider != ProviderGeminiLive || got.Model != "" || got.Effort != task.DefaultEffort {
			t.Errorf("%s = %+v", task.ID, got)
		}
	}
	if s.AIChoice(TaskInterviewTips).Effort != "low" || s.AIChoice(TaskResumeImprove).Effort != "low" || s.AIChoice(TaskResumeTailor).Effort != "high" {
		t.Fatalf("efforts = %+v", s.AIFeatures)
	}
	if s.AnthropicModel != "claude-opus-5-5" || s.ClaudeCodePath != "" || s.ClaudeCodeModel != "" {
		t.Fatalf("s = %+v", s)
	}
}

// A task an older build knew but this one doesn't is dropped rather than failing the load.
func TestAIFeaturesDropUnknownTasks(t *testing.T) {
	dir := t.TempDir()
	os.WriteFile(filepath.Join(dir, "settings.json"), []byte(`{"aiFeatures": {"retired": {"provider": "anthropic"}, "jobMatch": {"provider": "deepseek", "model": " dm "}}}`), 0o600)
	s, err := NewSettingsStore(dir).Load()
	if err != nil {
		t.Fatal(err)
	}
	if _, ok := s.AIFeatures["retired"]; ok {
		t.Fatal("unknown task kept")
	}
	if got := s.AIChoice(TaskJobMatch); got != (AIChoice{Provider: ProviderDeepSeek, Model: "dm", Effort: "high"}) {
		t.Fatalf("jobMatch = %+v", got)
	}
}

func TestSettingsRejectsBadAIValues(t *testing.T) {
	store := NewSettingsStore(t.TempDir())
	for name, c := range map[string]AIChoice{
		"unknown provider": {Provider: "skynet"},
		"unknown effort":   {Provider: ProviderAnthropic, Effort: "extreme"},
	} {
		err := store.Save(Settings{AIFeatures: map[string]AIChoice{TaskInterviewGrading: c}})
		if err == nil {
			t.Errorf("%s should be rejected", name)
		}
	}
	err := store.Save(Settings{AIFeatures: map[string]AIChoice{TaskInterviewPlan: {Provider: "nope"}}})
	if err == nil || !strings.Contains(err.Error(), `unknown AI provider "nope"`) {
		t.Fatalf("err = %v", err)
	}
}

func TestSettingsOpenAIDefaults(t *testing.T) {
	dir := t.TempDir()
	os.WriteFile(filepath.Join(dir, "settings.json"), []byte(`{"followUpDays": 7}`), 0o600)
	s, err := NewSettingsStore(dir).Load()
	if err != nil || s.OllamaURL != "http://localhost:11434/v1" || s.LMStudioURL != "http://localhost:1234/v1" || s.CustomAIMode != "plain" {
		t.Fatalf("OllamaURL = %q, CustomAIMode = %q, %v", s.OllamaURL, s.CustomAIMode, err)
	}
}

func TestSettingsRejectsUnknownCustomAIMode(t *testing.T) {
	err := NewSettingsStore(t.TempDir()).Save(Settings{CustomAIMode: "xml"})
	if err == nil || !strings.Contains(err.Error(), "answer mode") {
		t.Fatalf("err = %v", err)
	}
}

// Choosing a provider that isn't set up yet is allowed; it shows "setup needed" until it is.
func TestSettingsAllowsUnconfiguredProvider(t *testing.T) {
	if err := NewSettingsStore(t.TempDir()).Save(Settings{AIFeatures: map[string]AIChoice{TaskInterviewGrading: {Provider: ProviderDeepSeek}}}); err != nil {
		t.Fatal(err)
	}
}

func TestSettingsTrimsOpenAIFields(t *testing.T) {
	store := NewSettingsStore(t.TempDir())
	if err := store.Save(Settings{DeepSeekModel: " deepseek-chat ", CustomAIBaseURL: " http://c/v1 "}); err != nil {
		t.Fatal(err)
	}
	s, _ := store.Load()
	if s.DeepSeekModel != "deepseek-chat" || s.CustomAIBaseURL != "http://c/v1" {
		t.Fatalf("s = %+v", s)
	}
}

func TestMatchDefaults(t *testing.T) {
	s, err := NewSettingsStore(t.TempDir()).Load()
	if err != nil || s.MatchEnabled || s.MatchPerRequest != DefaultMatchPerRequest ||
		s.MatchWorkModes == nil || len(s.MatchWorkModes) != 0 || s.MatchSeniority != "" || s.MatchMinSalary != 0 {
		t.Fatalf("s = %+v, %v", s, err)
	}
}

func TestMatchSettingsValidation(t *testing.T) {
	store := NewSettingsStore(t.TempDir())
	bad := map[string]Settings{
		"too few per request":  {MatchPerRequest: 4},
		"too many per request": {MatchPerRequest: 51},
		"unknown work mode":    {MatchWorkModes: []string{"remote", "moon"}},
		"unknown seniority":    {MatchSeniority: "wizard"},
		"negative salary":      {MatchMinSalary: -1},
	}
	for name, s := range bad {
		if err := store.Save(s); err == nil {
			t.Errorf("%s: expected an error", name)
		}
	}
	ok := Settings{MatchEnabled: true, MatchPerRequest: 5, MatchMinSalary: 120000,
		MatchWorkModes: []string{"onsite", "remote"}, MatchLocations: "  Denver, CO ", MatchSeniority: "senior", MatchGoals: " no on-call "}
	if err := store.Save(ok); err != nil {
		t.Fatal(err)
	}
	got, _ := store.Load()
	if got.MatchLocations != "Denver, CO" || got.MatchGoals != "no on-call" || got.MatchPerRequest != 5 || !got.MatchEnabled {
		t.Fatalf("got %+v", got)
	}
}
