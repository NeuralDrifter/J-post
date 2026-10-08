// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

package ai

import (
	"context"
	"encoding/json"
	"strings"

	"jobtrack/internal/gemini"
	"jobtrack/internal/settings"
)

// geminiProvider runs tasks on the Gemini Live model through a submit_result
// tool call (liveStructured), the same model that runs the interview.
type geminiProvider struct{}

func (geminiProvider) id() string    { return settings.ProviderGeminiLive }
func (geminiProvider) label() string { return "Gemini Live" }

func (geminiProvider) unavailable(s settings.Settings) string {
	if s.GeminiKey == "" {
		return "Add your Gemini API key in Settings → AI"
	}
	return ""
}

func (geminiProvider) run(ctx context.Context, s settings.Settings, t Task) (aiResult, error) {
	var raw json.RawMessage
	err := gemini.LiveStructured(ctx, s.GeminiKey, gemini.JSONPrompt{
		Model:  s.GeminiLiveModel,
		System: t.Instruction,
		Parts:  []gemini.Part{{Text: t.Input}},
		Schema: GeminiSchema(t.Schema),
	}, &raw)
	return aiResult{raw: raw, model: s.GeminiLiveModel}, err
}

// GeminiSchema converts a standard JSON Schema to Gemini's dialect: uppercase
// types and no additionalProperties. The input is not modified.
func GeminiSchema(schema map[string]any) map[string]any {
	out := make(map[string]any, len(schema))
	for k, v := range schema {
		switch k {
		case "additionalProperties":
			continue
		case "type":
			if typ, ok := v.(string); ok {
				v = strings.ToUpper(typ)
			}
		case "properties":
			props := map[string]any{}
			for name, p := range v.(map[string]any) {
				props[name] = GeminiSchema(p.(map[string]any))
			}
			v = props
		case "items":
			v = GeminiSchema(v.(map[string]any))
		}
		out[k] = v
	}
	return out
}
