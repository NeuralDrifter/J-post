// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

package settings

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

	"jobtrack/internal/marketdata"
	"jobtrack/internal/taxes"
)

const (
	DefaultFollowUpDays       = 7
	maxFollowUpDays           = 365
	defaultDiscoverCacheHours = 12
	maxDiscoverCacheHours     = 168 // a week
	defaultGeminiLiveModel    = "gemini-3.8-live"
	defaultAnthropicModel     = "claude-opus-5-5"
	defaultGradingEffort      = "high"
	defaultTipsEffort         = "low"
	DefaultOllamaURL          = "http://localhost:11434/v1"
	DefaultLMStudioURL        = "http://localhost:1234/v1"
	DefaultMatchPerRequest    = 25
	minMatchPerRequest        = 5
	maxMatchPerRequest        = 50
)

// AI provider IDs, as stored in the *Provider settings.
const (
	ProviderGeminiLive = "gemini-live"
	ProviderAnthropic  = "anthropic"
	ProviderClaudeCode = "claude-code"
	// OpenAI-style APIs, all served by openAIProvider (provider_openai.go).
	ProviderOpenAI           = "openai"
	ProviderDeepSeek         = "deepseek"
	ProviderOllama           = "ollama"
	ProviderLMStudio         = "lmstudio"
	ProviderOpenAICompatible = "openai-compatible"
)

// AIProviderIDs lists every provider a setting may name, in display order.
// aiProviders() offers exactly these (TestProviderIDsMatchRegistry).
var AIProviderIDs = []string{
	ProviderGeminiLive, ProviderAnthropic, ProviderClaudeCode,
	ProviderOpenAI, ProviderDeepSeek, ProviderOllama, ProviderLMStudio, ProviderOpenAICompatible,
}

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
	// Job matching: Discover postings get an AI match score (see internal/app/match.go).
	MatchEnabled    bool     `json:"matchEnabled"`    // score new postings after each search
	MatchProvider   string   `json:"matchProvider"`   // an AI provider ID
	MatchPerRequest int      `json:"matchPerRequest"` // postings sent per request
	MatchMinSalary  int64    `json:"matchMinSalary"`  // annual floor in dollars; 0 = none
	MatchWorkModes  []string `json:"matchWorkModes"`  // WorkModes values; empty = no preference
	MatchLocations  string   `json:"matchLocations"`
	MatchSeniority  string   `json:"matchSeniority"` // a MatchSeniorityOptions value; "" = no target
	MatchGoals      string   `json:"matchGoals"`     // free text: wants, must-haves, deal-breakers
}

// AnthropicEfforts are the effort levels the Anthropic API accepts.
var AnthropicEfforts = []string{"low", "medium", "high", "xhigh", "max"}

// WorkModes are how a job is worked; jobs, postings and the job-match
// preferences all use these values.
var WorkModes = []string{"remote", "hybrid", "onsite"}

// MatchSeniorityOptions are the target levels the job-match preferences accept.
var MatchSeniorityOptions = []string{"entry", "mid", "senior", "staff", "principal", "manager"}

// AnswerMode is how a request asks for a structured answer (response_format).
type AnswerMode string

const (
	ModeJSONSchema AnswerMode = "json_schema" // strict schema; the server enforces the shape
	ModeJSONObject AnswerMode = "json_object" // JSON mode; the schema goes in the instruction
	ModePlain      AnswerMode = "plain"       // no response_format; the schema goes in the instruction
)

// Choice is one option of a Settings dropdown.
type Choice struct {
	ID    string `json:"id"`
	Label string `json:"label"`
}

// AnswerModeChoices are the answer modes, in the order Settings offers them.
var AnswerModeChoices = []Choice{
	{ID: string(ModePlain), Label: "plain — works with any server"},
	{ID: string(ModeJSONObject), Label: "json_object — JSON mode"},
	{ID: string(ModeJSONSchema), Label: "json_schema — strict schema"},
}

func answerModeNames() []string {
	names := make([]string, len(AnswerModeChoices))
	for i, c := range AnswerModeChoices {
		names[i] = c.ID
	}
	return names
}

type SettingsStore struct {
	mu       sync.Mutex
	filePath string
}

// DefaultDataDir is where the app keeps its database, settings and files.
// JOBTRACK_DATA_DIR overrides it (handy for testing against a scratch folder).
func DefaultDataDir() string {
	if dir := os.Getenv("JOBTRACK_DATA_DIR"); dir != "" {
		return dir
	}
	home, err := os.UserHomeDir()
	if err != nil {
		home = "."
	}
	return filepath.Join(home, ".jobtrack")
}

func ApplyDefaults(s *Settings) {
	if s.FollowUpDays <= 0 {
		s.FollowUpDays = DefaultFollowUpDays
	}
	if s.FilingStatus == "" {
		s.FilingStatus = taxes.FilingSingle
	}
	if s.HomeAreaCode == "" {
		s.HomeAreaCode = marketdata.NationalArea
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
	s.GradingProvider = cmp.Or(s.GradingProvider, ProviderGeminiLive)
	s.TipsProvider = cmp.Or(s.TipsProvider, ProviderGeminiLive)
	s.PlanProvider = cmp.Or(s.PlanProvider, ProviderGeminiLive)
	s.AnthropicModel = cmp.Or(strings.TrimSpace(s.AnthropicModel), defaultAnthropicModel)
	s.AnthropicGradingEffort = cmp.Or(s.AnthropicGradingEffort, defaultGradingEffort)
	s.AnthropicTipsEffort = cmp.Or(s.AnthropicTipsEffort, defaultTipsEffort)
	s.ClaudeCodePath = strings.TrimSpace(s.ClaudeCodePath)
	s.ClaudeCodeModel = strings.TrimSpace(s.ClaudeCodeModel)
	s.OpenAIModel = strings.TrimSpace(s.OpenAIModel)
	s.DeepSeekModel = strings.TrimSpace(s.DeepSeekModel)
	s.OllamaURL = cmp.Or(strings.TrimSpace(s.OllamaURL), DefaultOllamaURL)
	s.OllamaModel = strings.TrimSpace(s.OllamaModel)
	s.LMStudioURL = cmp.Or(strings.TrimSpace(s.LMStudioURL), DefaultLMStudioURL)
	s.LMStudioModel = strings.TrimSpace(s.LMStudioModel)
	s.CustomAIBaseURL = strings.TrimSpace(s.CustomAIBaseURL)
	s.CustomAIModel = strings.TrimSpace(s.CustomAIModel)
	s.CustomAIMode = cmp.Or(s.CustomAIMode, string(ModePlain))
	s.MatchProvider = cmp.Or(s.MatchProvider, ProviderGeminiLive)
	if s.MatchPerRequest <= 0 {
		s.MatchPerRequest = DefaultMatchPerRequest
	}
	if s.MatchWorkModes == nil {
		s.MatchWorkModes = []string{}
	}
	s.MatchLocations = strings.TrimSpace(s.MatchLocations)
	s.MatchGoals = strings.TrimSpace(s.MatchGoals)
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
	ApplyDefaults(&settings)
	return settings, nil
}

// Save writes atomically; 0600 because the file holds API keys.
func (s *SettingsStore) Save(settings Settings) error {
	ApplyDefaults(&settings)
	if err := settings.validate(); err != nil {
		return err
	}
	data, err := json.MarshalIndent(settings, "", "  ")
	if err != nil {
		return err
	}

	s.mu.Lock()
	defer s.mu.Unlock()
	return writeFileAtomic(s.filePath, data, 0o600)
}

// validate checks settings that already have their defaults applied.
func (s Settings) validate() error {
	if !taxes.ValidFilingStatus(s.FilingStatus) {
		return errors.New("filing status must be single, married or head of household")
	}
	if s.USAJobsKey != "" && !strings.Contains(s.USAJobsEmail, "@") {
		return errors.New("USAJobs needs the email address you registered the key with")
	}
	if s.DiscoverCacheHours > maxDiscoverCacheHours {
		return fmt.Errorf("search results can be reused for at most %d hours (a week)", maxDiscoverCacheHours)
	}
	if s.FollowUpDays > maxFollowUpDays {
		return fmt.Errorf("follow-up threshold must be between 1 and %d days", maxFollowUpDays)
	}
	if err := s.validateAIChoices(); err != nil {
		return err
	}
	return s.validateMatchPreferences()
}

// validateAIChoices checks the provider picked for each AI job and the provider options.
func (s Settings) validateAIChoices() error {
	for _, id := range []string{s.GradingProvider, s.TipsProvider, s.PlanProvider, s.MatchProvider} {
		if !slices.Contains(AIProviderIDs, id) {
			return fmt.Errorf("unknown AI provider %q", id)
		}
	}
	for _, effort := range []string{s.AnthropicGradingEffort, s.AnthropicTipsEffort} {
		if !slices.Contains(AnthropicEfforts, effort) {
			return fmt.Errorf("effort must be one of %s", strings.Join(AnthropicEfforts, ", "))
		}
	}
	if !slices.Contains(answerModeNames(), s.CustomAIMode) {
		return fmt.Errorf("answer mode must be one of %s", strings.Join(answerModeNames(), ", "))
	}
	return nil
}

func (s Settings) validateMatchPreferences() error {
	if s.MatchPerRequest < minMatchPerRequest || s.MatchPerRequest > maxMatchPerRequest {
		return fmt.Errorf("postings per request must be between %d and %d", minMatchPerRequest, maxMatchPerRequest)
	}
	for _, m := range s.MatchWorkModes {
		if !slices.Contains(WorkModes, m) {
			return fmt.Errorf("work mode must be one of %s", strings.Join(WorkModes, ", "))
		}
	}
	if s.MatchSeniority != "" && !slices.Contains(MatchSeniorityOptions, s.MatchSeniority) {
		return fmt.Errorf("seniority must be one of %s", strings.Join(MatchSeniorityOptions, ", "))
	}
	if s.MatchMinSalary < 0 {
		return errors.New("the salary floor can't be negative")
	}
	return nil
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
