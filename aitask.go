package main

import (
	"context"
	"encoding/json"
	"fmt"
)

// The AI task layer: every AI job in the app (interview grading, coaching tips,
// later job ranking) is an aiTask, and any aiProvider can run it.

const (
	providerGeminiLive = "gemini-live"
	providerAnthropic  = "anthropic"
	providerClaudeCode = "claude-code"
)

// aiRole picks per-role settings such as effort and timeouts.
type aiRole int

const (
	roleGrading aiRole = iota
	roleTips
)

// aiTask is one AI job with a structured answer.
type aiTask struct {
	name        string
	instruction string         // the system prompt
	input       string         // the material to work on
	schema      map[string]any // the result's shape, standard JSON Schema
	role        aiRole
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
	unavailable(s Settings) string
	run(ctx context.Context, s Settings, t aiTask) (aiResult, error)
}

// aiProviders lists every provider in display order.
func aiProviders() []aiProvider {
	return []aiProvider{geminiProvider{}}
}

func providerByID(id string) (aiProvider, bool) {
	for _, p := range aiProviders() {
		if p.id() == id {
			return p, true
		}
	}
	return nil, false
}

// runAITask runs t on the named provider and decodes the result into out. An
// unconfigured provider fails with its setup reason before any call is made.
func runAITask(ctx context.Context, s Settings, providerID string, t aiTask, out any) (string, error) {
	p, ok := providerByID(providerID)
	if !ok {
		return "", fmt.Errorf("unknown AI provider %q", providerID)
	}
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
