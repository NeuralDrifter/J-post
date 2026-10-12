// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

package ai

import (
	"context"
	"encoding/json"
	"fmt"

	"jobtrack/internal/settings"
)

// The AI task layer: every AI job in the app (interview grading, coaching tips,
// later job ranking) is a Task, and any aiProvider can run it.

// Role picks per-role settings such as effort and timeouts.
type Role int

const (
	RoleGrading Role = iota
	RoleTips
	RolePlanning
	RoleMatching // job match scores for Discover postings, many per request
	RoleWriting  // resume and letter writing: tailoring, reviews, import tidying, drafts
)

// Task is one AI job with a structured answer.
type Task struct {
	Name        string
	Instruction string         // the system prompt
	Input       string         // the material to work on
	Schema      map[string]any // the result's shape, standard JSON Schema
	Role        Role
	Effort      string // set by RunTask from the task's AIChoice; Anthropic only
}

// aiResult is a provider's answer: the result JSON and the model that produced it.
type aiResult struct {
	raw   json.RawMessage
	model string
}

type aiProvider interface {
	id() string
	label() string
	// unavailable explains what's missing before this provider can run; "" when ready.
	unavailable(s settings.Settings) string
	run(ctx context.Context, s settings.Settings, t Task) (aiResult, error)
}

// aiProviders lists every provider in display order.
func aiProviders() []aiProvider {
	out := []aiProvider{geminiProvider{}, anthropicProvider{}, claudeCodeProvider{}}
	for _, p := range openAIPresets {
		out = append(out, openAIProvider{p})
	}
	return out
}

// AIProvider is a provider as Settings and the review page see it.
type AIProvider struct {
	ID          string `json:"id"`
	Label       string `json:"label"`
	Unavailable string `json:"unavailable"` // what's missing before it can run; "" when ready
}

func ListAIProviders(s settings.Settings) []AIProvider {
	out := []AIProvider{}
	for _, p := range aiProviders() {
		out = append(out, AIProvider{ID: p.id(), Label: p.label(), Unavailable: p.unavailable(s)})
	}
	return out
}

func providerByID(id string) (aiProvider, bool) {
	for _, p := range aiProviders() {
		if p.id() == id {
			return p, true
		}
	}
	return nil, false
}

// RunTask runs t as choice says (provider, model, effort) and decodes the
// result into out. An unconfigured provider fails with its setup reason before
// any call is made. The choice's model applies to this run only.
func RunTask(ctx context.Context, s settings.Settings, choice settings.AIChoice, t Task, out any) (string, error) {
	p, ok := providerByID(choice.Provider)
	if !ok {
		return "", fmt.Errorf("unknown AI provider %q", choice.Provider)
	}
	s = withModel(s, choice.Provider, choice.Model)
	t.Effort = choice.Effort
	if reason := p.unavailable(s); reason != "" {
		return "", fmt.Errorf("%s: %s", p.label(), reason)
	}
	res, err := p.run(ctx, s, t)
	if err != nil {
		return "", err
	}
	if err := json.Unmarshal(res.raw, out); err != nil {
		return "", fmt.Errorf("%s's answer wasn't in the expected format: %v", p.label(), err)
	}
	return res.model, nil
}

// withModel returns s with model as the provider's model; an empty model
// leaves the provider's own setting.
func withModel(s settings.Settings, providerID, model string) settings.Settings {
	if model == "" {
		return s
	}
	if field := providerModelField(&s, providerID); field != nil {
		*field = model
	}
	return s
}

func providerModelField(s *settings.Settings, providerID string) *string {
	fields := map[string]*string{
		settings.ProviderGeminiLive:       &s.GeminiLiveModel,
		settings.ProviderAnthropic:        &s.AnthropicModel,
		settings.ProviderClaudeCode:       &s.ClaudeCodeModel,
		settings.ProviderOpenAI:           &s.OpenAIModel,
		settings.ProviderDeepSeek:         &s.DeepSeekModel,
		settings.ProviderOllama:           &s.OllamaModel,
		settings.ProviderLMStudio:         &s.LMStudioModel,
		settings.ProviderOpenAICompatible: &s.CustomAIModel,
	}
	return fields[providerID]
}
