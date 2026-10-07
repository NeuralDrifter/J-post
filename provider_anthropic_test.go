package main

import (
	"context"
	"encoding/json"
	"net/http"
	"reflect"
	"strings"
	"testing"
)

// fakeAnthropic serves /v1/messages with handler and points the provider at it.
func fakeAnthropic(t *testing.T, handler http.HandlerFunc) {
	t.Helper()
	url := fakeServer(t, handler)
	oldURL, oldRetries := anthropicBaseURL, anthropicMaxRetries
	anthropicBaseURL, anthropicMaxRetries = url, 0
	t.Cleanup(func() { anthropicBaseURL, anthropicMaxRetries = oldURL, oldRetries })
}

func anthropicReply(model, text, stopReason string) []byte {
	b, _ := json.Marshal(map[string]any{
		"id": "msg_1", "type": "message", "role": "assistant", "model": model,
		"content":     []any{map[string]any{"type": "text", "text": text}},
		"stop_reason": stopReason,
		"usage":       map[string]any{"input_tokens": 10, "output_tokens": 5},
	})
	return b
}

var anthropicSettings = Settings{AnthropicKey: "sk-ant-s3cret", AnthropicModel: "claude-opus-5-5", AnthropicGradingEffort: "high", AnthropicTipsEffort: "low"}

func TestAnthropicRequestShape(t *testing.T) {
	var body map[string]any
	var header http.Header
	fakeAnthropic(t, func(w http.ResponseWriter, r *http.Request) {
		header = r.Header.Clone()
		json.NewDecoder(r.Body).Decode(&body)
		w.Header().Set("Content-Type", "application/json")
		w.Write(anthropicReply("claude-opus-5-5", `{"nudge":"x","kind":"tip"}`, "end_turn"))
	})
	task := scorecardTask(Job{Company: "Acme"}, MockInterview{}, "")
	if _, err := (anthropicProvider{}).run(context.Background(), anthropicSettings, task); err != nil {
		t.Fatal(err)
	}
	cfg, _ := body["output_config"].(map[string]any)
	format, _ := cfg["format"].(map[string]any)
	var wantSchema any
	b, _ := json.Marshal(task.schema)
	json.Unmarshal(b, &wantSchema)
	if body["model"] != "claude-opus-5-5" || body["max_tokens"] != float64(16000) || cfg["effort"] != "high" ||
		format["type"] != "json_schema" || !reflect.DeepEqual(format["schema"], wantSchema) || body["fallbacks"] != "default" {
		t.Fatalf("body = %v", body)
	}
	if body["tool_choice"] != nil || body["thinking"] != nil {
		t.Fatalf("must not force tool use or set thinking: %v", body)
	}
	if header.Get("x-api-key") != "sk-ant-s3cret" || !strings.Contains(header.Get("anthropic-beta"), "server-side-fallback-2026-07-01") {
		t.Fatalf("headers = %v", header)
	}
}

func TestAnthropicTipsUseTipsEffortAndSmallBudget(t *testing.T) {
	var body map[string]any
	fakeAnthropic(t, func(w http.ResponseWriter, r *http.Request) {
		json.NewDecoder(r.Body).Decode(&body)
		w.Header().Set("Content-Type", "application/json")
		w.Write(anthropicReply("claude-opus-5-5", `{"nudge":"x","kind":"tip"}`, "end_turn"))
	})
	if _, err := (anthropicProvider{}).run(context.Background(), anthropicSettings, nudgeTask("q", "a")); err != nil {
		t.Fatal(err)
	}
	if body["max_tokens"] != float64(1024) || body["output_config"].(map[string]any)["effort"] != "low" {
		t.Fatalf("body = %v", body)
	}
}

func TestAnthropicReturnsResultAndModel(t *testing.T) {
	fakeAnthropic(t, func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Write(anthropicReply("claude-opus-5-5", `{"nudge":"Lead with the result","kind":"tip"}`, "end_turn"))
	})
	var n Nudge
	model, err := runAITask(context.Background(), anthropicSettings, providerAnthropic, nudgeTask("q", "a"), &n)
	if err != nil || n.Nudge != "Lead with the result" || model != "claude-opus-5-5" {
		t.Fatalf("n = %+v, model = %q, err = %v", n, model, err)
	}
}

func TestAnthropicRefusal(t *testing.T) {
	fakeAnthropic(t, func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Write(anthropicReply("claude-opus-5-5", "", "refusal"))
	})
	_, err := (anthropicProvider{}).run(context.Background(), anthropicSettings, nudgeTask("q", "a"))
	if err == nil || !strings.Contains(err.Error(), "declined") {
		t.Fatalf("err = %v", err)
	}
}

func TestAnthropicErrorsAreReadableAndHideKey(t *testing.T) {
	cases := []struct {
		status int
		header map[string]string
		want   string
	}{
		{401, nil, "rejected the API key"},
		{429, map[string]string{"retry-after": "30"}, "30 s"},
		{529, nil, "temporarily unavailable"},
		{500, nil, "temporarily unavailable"},
	}
	for _, c := range cases {
		fakeAnthropic(t, func(w http.ResponseWriter, r *http.Request) {
			for k, v := range c.header {
				w.Header().Set(k, v)
			}
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(c.status)
			w.Write([]byte(`{"type":"error","error":{"type":"x","message":"sk-ant-s3cret is bad"}}`))
		})
		_, err := (anthropicProvider{}).run(context.Background(), anthropicSettings, nudgeTask("q", "a"))
		if err == nil || !strings.Contains(err.Error(), c.want) || strings.Contains(err.Error(), "sk-ant-s3cret") {
			t.Errorf("%d: err = %v", c.status, err)
		}
	}
}

func TestAnthropicUnavailableWithoutKey(t *testing.T) {
	if reason := (anthropicProvider{}).unavailable(Settings{}); !strings.Contains(reason, "Anthropic API key") {
		t.Fatalf("reason = %q", reason)
	}
	if (anthropicProvider{}).unavailable(anthropicSettings) != "" {
		t.Fatal("a key should make it ready")
	}
}

func TestAnthropicOtherErrorsKeepTheAPIMessage(t *testing.T) {
	fakeAnthropic(t, func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusNotFound)
		w.Write([]byte(`{"type":"error","error":{"type":"not_found_error","message":"model: claude-opus-9 (key sk-ant-s3cret)"}}`))
	})
	_, err := (anthropicProvider{}).run(context.Background(), anthropicSettings, nudgeTask("q", "a"))
	if err == nil || !strings.Contains(err.Error(), "claude-opus-9") || strings.Contains(err.Error(), "sk-ant-s3cret") {
		t.Fatalf("err = %v", err)
	}
}
