package main

import (
	"cmp"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"slices"
	"time"

	"github.com/openai/openai-go/v3"
	"github.com/openai/openai-go/v3/option"
	"github.com/openai/openai-go/v3/shared"
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

var (
	openAIBaseURLOverride = "" // tests point every preset at a fake server
	openAIMaxRetries      = 1  // one SDK retry for transient errors
	openAIMaxTokens       = map[aiRole]int64{roleGrading: 16000, roleTips: 1024, rolePlanning: 16000}
	openAITimeout         = map[aiRole]time.Duration{roleGrading: 5 * time.Minute, roleTips: 60 * time.Second, rolePlanning: 2 * time.Minute}
)

// openAIOptions builds the request options for one connection. It never uses
// openai.NewClient, which would add OPENAI_API_KEY, OPENAI_ORG_ID and other
// environment settings to requests bound for DeepSeek, Ollama or a custom server.
func openAIOptions(c openAIConn) []option.RequestOption {
	opts := []option.RequestOption{
		option.WithBaseURL(cmp.Or(openAIBaseURLOverride, c.baseURL)),
		option.WithHTTPClient(&http.Client{}),
		option.WithMaxRetries(openAIMaxRetries),
	}
	if c.key != "" {
		opts = append(opts, option.WithAPIKey(c.key))
	}
	return opts
}

// openAIInstruction is the system message. It stays byte-identical between
// runs of a task so DeepSeek's prefix cache keeps hitting. Modes the server
// doesn't enforce get the schema in the text (DeepSeek's JSON mode also
// requires the word "json").
func openAIInstruction(t aiTask, mode answerMode) string {
	if mode == modeJSONSchema {
		return t.instruction
	}
	schema, _ := json.Marshal(t.schema) // map keys marshal in sorted order
	return t.instruction + "\n\nReply with only a json object matching this JSON Schema:\n" + string(schema)
}

func (o openAIProvider) run(ctx context.Context, s Settings, t aiTask) (aiResult, error) {
	c := o.p.conn(s)
	ctx, cancel := context.WithTimeout(ctx, openAITimeout[t.role])
	defer cancel()
	chat := openai.NewChatCompletionService(openAIOptions(c)...)

	params := openai.ChatCompletionNewParams{
		Model: c.model,
		Messages: []openai.ChatCompletionMessageParamUnion{
			openai.SystemMessage(openAIInstruction(t, c.mode)),
			openai.UserMessage(t.input),
		},
	}
	// OpenAI's newer models reject max_tokens; DeepSeek and Ollama document only max_tokens.
	if o.p.id == providerOpenAI {
		params.MaxCompletionTokens = openai.Int(openAIMaxTokens[t.role])
	} else {
		params.MaxTokens = openai.Int(openAIMaxTokens[t.role])
	}
	switch c.mode {
	case modeJSONSchema:
		params.ResponseFormat.OfJSONSchema = &shared.ResponseFormatJSONSchemaParam{
			JSONSchema: shared.ResponseFormatJSONSchemaJSONSchemaParam{Name: t.name, Strict: openai.Bool(strictCompatible(t.schema)), Schema: t.schema},
		}
	case modeJSONObject:
		params.ResponseFormat.OfJSONObject = &shared.ResponseFormatJSONObjectParam{}
	}

	var model string
	for attempt := 1; ; attempt++ {
		resp, err := chat.New(ctx, params)
		if err != nil {
			return aiResult{}, openAIError(err, o.p.label, c)
		}
		model = resp.Model
		logOpenAIUsage(o.p.label, resp)
		content := ""
		if len(resp.Choices) > 0 {
			content = resp.Choices[0].Message.Content
		}
		raw, err := extractJSON(content)
		if err == nil {
			err = validateAnswer(raw, t.schema)
		}
		if err == nil {
			return aiResult{raw: raw, model: model}, nil
		}
		if attempt == 2 {
			return aiResult{}, fmt.Errorf("%s's answer wasn't in the expected format: %v", o.p.label, err)
		}
		params.Messages = append(params.Messages,
			openai.AssistantMessage(content),
			openai.UserMessage("That answer wasn't valid: "+err.Error()+". Reply again with only the corrected json object."))
	}
}

// strictCompatible reports whether OpenAI's strict mode accepts schema: every
// object property must be required. Otherwise the schema is sent as guidance
// and validateAnswer enforces it.
func strictCompatible(schema map[string]any) bool {
	switch schema["type"] {
	case "object":
		props, _ := schema["properties"].(map[string]any)
		required, _ := schema["required"].([]string)
		for name, p := range props {
			sub, _ := p.(map[string]any)
			if !slices.Contains(required, name) || !strictCompatible(sub) {
				return false
			}
		}
	case "array":
		items, _ := schema["items"].(map[string]any)
		return strictCompatible(items)
	}
	return true
}

// logOpenAIUsage logs token use; DeepSeek adds prompt-cache hit/miss counts.
func logOpenAIUsage(label string, resp *openai.ChatCompletion) {
	var extra struct {
		Usage struct {
			Hit  *int64 `json:"prompt_cache_hit_tokens"`
			Miss *int64 `json:"prompt_cache_miss_tokens"`
		} `json:"usage"`
	}
	json.Unmarshal([]byte(resp.RawJSON()), &extra)
	line := fmt.Sprintf("%s: %s, %d prompt tokens", label, resp.Model, resp.Usage.PromptTokens)
	if extra.Usage.Hit != nil && extra.Usage.Miss != nil {
		line += fmt.Sprintf(" (cache hit %d, miss %d)", *extra.Usage.Hit, *extra.Usage.Miss)
	}
	log.Print(line)
}

// listModels asks the server which models it offers (GET /models), sorted.
func (o openAIProvider) listModels(ctx context.Context, s Settings) ([]string, error) {
	c := o.p.conn(s)
	if o.p.needsKey && c.key == "" {
		return nil, fmt.Errorf("Add your %s API key first", o.p.label)
	}
	if c.baseURL == "" {
		return nil, errors.New("Enter the server address first")
	}
	ctx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()
	models := openai.NewModelService(openAIOptions(c)...)
	page, err := models.List(ctx)
	if err != nil {
		return nil, openAIError(err, o.p.label, c)
	}
	ids := make([]string, 0, len(page.Data))
	for _, m := range page.Data {
		ids = append(ids, m.ID)
	}
	slices.Sort(ids)
	return ids, nil
}

// listAIModels lists the models of an OpenAI-style provider, using the
// settings as currently entered (not necessarily saved).
func listAIModels(ctx context.Context, providerID string, s Settings) ([]string, error) {
	p, ok := providerByID(providerID)
	op, isOpenAI := p.(openAIProvider)
	if !ok || !isOpenAI {
		return nil, fmt.Errorf("%q can't list models", providerID)
	}
	applySettingsDefaults(&s)
	return op.listModels(ctx, s)
}

// AIProviderTest is the result of the Settings "Test" button.
type AIProviderTest struct {
	Model  string `json:"model"`
	Millis int64  `json:"millis"`
}

var providerTestSchema = map[string]any{
	"type":                 "object",
	"properties":           map[string]any{"ok": map[string]any{"type": "boolean"}},
	"required":             []string{"ok"},
	"additionalProperties": false,
}

// testAIProvider runs a tiny task on any provider, with the settings as
// currently entered, and reports which model answered and how long it took.
func testAIProvider(ctx context.Context, providerID string, s Settings) (AIProviderTest, error) {
	applySettingsDefaults(&s)
	t := aiTask{name: "test", instruction: `Reply with a json object {"ok": true}.`, input: "ping", schema: providerTestSchema, role: roleTips}
	start := time.Now()
	var out struct{ OK bool }
	model, err := runAITask(ctx, s, providerID, t, &out)
	if err != nil {
		return AIProviderTest{}, err
	}
	return AIProviderTest{Model: model, Millis: time.Since(start).Milliseconds()}, nil
}
