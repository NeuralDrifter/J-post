// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

package main

import (
	"cmp"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"sync"
)

const (
	defaultFollowUpDays       = 7
	defaultDiscoverCacheHours = 12
	defaultGeminiLiveModel    = "gemini-3.8-live"
	defaultAnthropicModel     = "claude-opus-5-5"
	defaultGradingEffort      = "high"
	defaultTipsEffort         = "low"
	defaultOllamaURL          = "http://localhost:11434/v1"
	defaultLMStudioURL        = "http://localhost:1234/v1"
)

type Settings struct {
	AdzunaAppID  string `json:"adzunaAppId"`
	AdzunaAppKey string `json:"adzunaAppKey"`
	PythonPath   string `json:"pythonPath"`
	FollowUpDays int    `json:"followUpDays"`
	// Compensation comparison: federal filing status, home area for cost of living, usual occupation.
	FilingStatus      string `json:"filingStatus"`
	HomeAreaCode      string `json:"homeAreaCode"`
	DefaultOccupation string `json:"defaultOccupation"`
	// Official job APIs.
	USAJobsKey     string   `json:"usajobsKey"`
	USAJobsEmail   string   `json:"usajobsEmail"`
	MuseCategories []string `json:"museCategories"`
	// AI (Google Gemini).
	GeminiKey       string `json:"geminiKey"`
	GeminiLiveModel string `json:"geminiLiveModel"`
	// Which AI provider grades interviews and gives coaching tips (an aiProvider id).
	GradingProvider string `json:"gradingProvider"`
	TipsProvider    string `json:"tipsProvider"`
	PlanProvider    string `json:"planProvider"` // writes the question plan before a mock interview
	// Anthropic API.
	AnthropicKey           string `json:"anthropicKey"`
	AnthropicModel         string `json:"anthropicModel"`
	AnthropicGradingEffort string `json:"anthropicGradingEffort"`
	AnthropicTipsEffort    string `json:"anthropicTipsEffort"`
	// Claude Code (headless). Empty path = find `claude` automatically; empty model = the plan's default.
	ClaudeCodePath  string `json:"claudeCodePath"`
	ClaudeCodeModel string `json:"claudeCodeModel"`
	// OpenAI-style APIs (provider_openai.go). Empty model = not chosen yet.
	OpenAIKey       string `json:"openaiKey"`
	OpenAIModel     string `json:"openaiModel"`
	DeepSeekKey     string `json:"deepseekKey"`
	DeepSeekModel   string `json:"deepseekModel"`
	OllamaURL       string `json:"ollamaURL"`
	OllamaModel     string `json:"ollamaModel"`
	LMStudioURL     string `json:"lmStudioURL"`
	LMStudioKey     string `json:"lmStudioKey"` // only when LM Studio's server requires a token
	LMStudioModel   string `json:"lmStudioModel"`
	CustomAIBaseURL string `json:"customAIBaseURL"`
	CustomAIKey     string `json:"customAIKey"`
	CustomAIModel   string `json:"customAIModel"`
	CustomAIMode    string `json:"customAIMode"` // an answerMode
	// DiscoverCacheHours: re-running a search within this window reuses stored results.
	DiscoverCacheHours int `json:"discoverCacheHours"`
}

// anthropicEfforts are the effort levels the Anthropic API accepts.
var anthropicEfforts = []string{"low", "medium", "high", "xhigh", "max"}

type SettingsStore struct {
	mu       sync.Mutex
	filePath string
}

// defaultDataDir is where the app keeps its database, settings and files.
// JOBTRACK_DATA_DIR overrides it (handy for testing against a scratch folder).
func defaultDataDir() string {
	if dir := os.Getenv("JOBTRACK_DATA_DIR"); dir != "" {
		return dir
	}
	home, err := os.UserHomeDir()
	if err != nil {
		home = "."
	}
	return filepath.Join(home, ".jobtrack")
}

func applySettingsDefaults(s *Settings) {
	if s.FollowUpDays <= 0 {
		s.FollowUpDays = defaultFollowUpDays
	}
	if s.FilingStatus == "" {
		s.FilingStatus = FilingSingle
	}
	if s.HomeAreaCode == "" {
		s.HomeAreaCode = nationalArea
	}
	if s.MuseCategories == nil {
		s.MuseCategories = []string{}
	}
	if s.GeminiLiveModel == "" {
		s.GeminiLiveModel = defaultGeminiLiveModel
	}
	if s.DiscoverCacheHours <= 0 {
		s.DiscoverCacheHours = defaultDiscoverCacheHours
	}
	s.GradingProvider = cmp.Or(s.GradingProvider, providerGeminiLive)
	s.TipsProvider = cmp.Or(s.TipsProvider, providerGeminiLive)
	s.PlanProvider = cmp.Or(s.PlanProvider, providerGeminiLive)
	s.AnthropicModel = cmp.Or(strings.TrimSpace(s.AnthropicModel), defaultAnthropicModel)
	s.AnthropicGradingEffort = cmp.Or(s.AnthropicGradingEffort, defaultGradingEffort)
	s.AnthropicTipsEffort = cmp.Or(s.AnthropicTipsEffort, defaultTipsEffort)
	s.ClaudeCodePath = strings.TrimSpace(s.ClaudeCodePath)
	s.ClaudeCodeModel = strings.TrimSpace(s.ClaudeCodeModel)
	s.OpenAIModel = strings.TrimSpace(s.OpenAIModel)
	s.DeepSeekModel = strings.TrimSpace(s.DeepSeekModel)
	s.OllamaURL = cmp.Or(strings.TrimSpace(s.OllamaURL), defaultOllamaURL)
	s.OllamaModel = strings.TrimSpace(s.OllamaModel)
	s.LMStudioURL = cmp.Or(strings.TrimSpace(s.LMStudioURL), defaultLMStudioURL)
	s.LMStudioModel = strings.TrimSpace(s.LMStudioModel)
	s.CustomAIBaseURL = strings.TrimSpace(s.CustomAIBaseURL)
	s.CustomAIModel = strings.TrimSpace(s.CustomAIModel)
	s.CustomAIMode = cmp.Or(s.CustomAIMode, string(modePlain))
}

func NewSettingsStore(dir string) *SettingsStore {
	return &SettingsStore{filePath: filepath.Join(dir, "settings.json")}
}

func (s *SettingsStore) Load() (Settings, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	var settings Settings
	data, err := os.ReadFile(s.filePath)
	if err != nil && !errors.Is(err, os.ErrNotExist) {
		return settings, err
	}
	if err == nil {
		if err := json.Unmarshal(data, &settings); err != nil {
			return settings, err
		}
	}
	applySettingsDefaults(&settings)
	return settings, nil
}

// Save writes atomically; 0600 because the file holds API keys.
func (s *SettingsStore) Save(settings Settings) error {
	applySettingsDefaults(&settings)
	if !validFilingStatus(settings.FilingStatus) {
		return errors.New("filing status must be single, married or head of household")
	}
	if settings.USAJobsKey != "" && !strings.Contains(settings.USAJobsEmail, "@") {
		return errors.New("USAJobs needs the email address you registered the key with")
	}
	if settings.DiscoverCacheHours > 168 {
		return errors.New("search results can be reused for at most 168 hours (a week)")
	}
	if settings.FollowUpDays > 365 {
		return errors.New("follow-up threshold must be between 1 and 365 days")
	}
	for _, id := range []string{settings.GradingProvider, settings.TipsProvider, settings.PlanProvider} {
		if _, ok := providerByID(id); !ok {
			return fmt.Errorf("unknown AI provider %q", id)
		}
	}
	for _, effort := range []string{settings.AnthropicGradingEffort, settings.AnthropicTipsEffort} {
		if !slices.Contains(anthropicEfforts, effort) {
			return fmt.Errorf("effort must be one of %s", strings.Join(anthropicEfforts, ", "))
		}
	}
	if !slices.Contains(answerModes, answerMode(settings.CustomAIMode)) {
		return fmt.Errorf("answer mode must be one of %s", strings.Join(answerModeNames(), ", "))
	}
	data, err := json.MarshalIndent(settings, "", "  ")
	if err != nil {
		return err
	}

	s.mu.Lock()
	defer s.mu.Unlock()
	return writeFileAtomic(s.filePath, data, 0o600)
}

// writeFileAtomic writes via a temp file and rename, so a crash can't leave a
// half-written file.
func writeFileAtomic(path string, data []byte, perm os.FileMode) error {
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	tmp := path + ".tmp"
	if err := os.WriteFile(tmp, data, perm); err != nil {
		return err
	}
	if err := os.Rename(tmp, path); err != nil {
		os.Remove(tmp)
		return err
	}
	return nil
}
