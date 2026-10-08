package main

import (
	"context"
	"errors"
)

// openAIProvider runs tasks on any API that speaks OpenAI's Chat Completions
// format. Each preset (OpenAI, DeepSeek, Ollama, a custom server) is listed as
// its own provider; they share this one implementation.
type openAIProvider struct{ p openAIPreset }

// answerMode is how a request asks for a structured answer (response_format).
type answerMode string

const (
	modeJSONSchema answerMode = "json_schema" // strict schema; the server enforces the shape
	modeJSONObject answerMode = "json_object" // JSON mode; the schema goes in the instruction
	modePlain      answerMode = "plain"       // no response_format; the schema goes in the instruction
)

var answerModes = []answerMode{modeJSONSchema, modeJSONObject, modePlain}

func answerModeNames() []string {
	names := make([]string, len(answerModes))
	for i, m := range answerModes {
		names[i] = string(m)
	}
	return names
}

// openAIConn is everything one run needs to reach a server.
type openAIConn struct {
	baseURL, key, model string
	mode                answerMode
}

type openAIPreset struct {
	id, label string
	needsKey  bool
	conn      func(Settings) openAIConn
}

// openAIPresets lists the OpenAI-style providers in display order. Only
// services checked against the real API get a named preset; anything else
// goes through the custom one.
var openAIPresets = []openAIPreset{
	{id: providerOpenAI, label: "OpenAI", needsKey: true, conn: func(s Settings) openAIConn {
		return openAIConn{baseURL: "https://api.openai.com/v1", key: s.OpenAIKey, model: s.OpenAIModel, mode: modeJSONSchema}
	}},
	// DeepSeek documents only json_object, not json_schema.
	{id: providerDeepSeek, label: "DeepSeek", needsKey: true, conn: func(s Settings) openAIConn {
		return openAIConn{baseURL: "https://api.deepseek.com/v1", key: s.DeepSeekKey, model: s.DeepSeekModel, mode: modeJSONObject}
	}},
	{id: providerOllama, label: "Ollama (local)", conn: func(s Settings) openAIConn {
		return openAIConn{baseURL: s.OllamaURL, model: s.OllamaModel, mode: modeJSONSchema}
	}},
	{id: providerOpenAICompatible, label: "OpenAI-compatible (custom)", conn: func(s Settings) openAIConn {
		return openAIConn{baseURL: s.CustomAIBaseURL, key: s.CustomAIKey, model: s.CustomAIModel, mode: answerMode(s.CustomAIMode)}
	}},
}

func (o openAIProvider) id() string    { return o.p.id }
func (o openAIProvider) label() string { return o.p.label }

func (o openAIProvider) unavailable(s Settings) string {
	c := o.p.conn(s)
	switch {
	case o.p.needsKey && c.key == "":
		return "Add your " + o.p.label + " API key in Settings → AI"
	case c.baseURL == "":
		return "Enter the server address in Settings → AI"
	case c.model == "":
		return "Choose a model for " + o.p.label + " in Settings → AI"
	}
	return ""
}

func (o openAIProvider) run(ctx context.Context, s Settings, t aiTask) (aiResult, error) {
	return aiResult{}, errors.New("not implemented")
}
