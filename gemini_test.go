package main

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"strings"
	"testing"
	"time"
)

func withGeminiServer(t *testing.T, h http.HandlerFunc) {
	url := fakeServer(t, h)
	oldURL, oldDelays := geminiBaseURL, geminiRetryDelays
	geminiBaseURL, geminiRetryDelays = url, []time.Duration{0, 0}
	t.Cleanup(func() { geminiBaseURL, geminiRetryDelays = oldURL, oldDelays })
}

func TestGenerateJSON(t *testing.T) {
	withGeminiServer(t, func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1beta/models/gemini-3.8-flash:generateContent" || r.Header.Get("x-goog-api-key") != "k3y" || r.URL.RawQuery != "" {
			t.Errorf("request %s %s key=%q", r.URL.Path, r.URL.RawQuery, r.Header.Get("x-goog-api-key"))
		}
		var body map[string]any
		json.NewDecoder(r.Body).Decode(&body)
		gc := body["generationConfig"].(map[string]any)
		sys := body["systemInstruction"].(map[string]any)["parts"].([]any)[0].(map[string]any)["text"]
		parts := body["contents"].([]any)[0].(map[string]any)["parts"].([]any)
		inline := parts[1].(map[string]any)["inlineData"].(map[string]any)
		if gc["responseMimeType"] != "application/json" || gc["responseSchema"] == nil || sys != "be brief" ||
			parts[0].(map[string]any)["text"] != "hello" || inline["mimeType"] != "application/pdf" || inline["data"] != "UERG" {
			t.Errorf("body = %v", body)
		}
		w.Write([]byte(`{"candidates":[{"content":{"parts":[{"text":"{\"nudge\":\"Add a result\","},{"text":"\"kind\":\"tip\"}"}]}}]}`))
	})
	var out struct{ Nudge, Kind string }
	err := generateJSON(context.Background(), "k3y", "gemini-3.8-flash", "be brief",
		[]geminiPart{{Text: "hello"}, {InlineData: &geminiBlob{MimeType: "application/pdf", Data: "UERG"}}},
		map[string]any{"type": "OBJECT"}, &out)
	if err != nil || out.Nudge != "Add a result" || out.Kind != "tip" {
		t.Fatalf("out=%+v err=%v", out, err)
	}
}

func TestGenerateJSONErrors(t *testing.T) {
	var out map[string]any
	if err := generateJSON(context.Background(), "", "m", "", nil, nil, &out); err == nil || !strings.Contains(err.Error(), "Settings") {
		t.Fatalf("missing key err = %v", err)
	}
	withGeminiServer(t, func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, `{"error":{"message":"API key not valid"}}`, http.StatusBadRequest)
	})
	err := generateJSON(context.Background(), "s3cretkey", "m", "", []geminiPart{{Text: "x"}}, nil, &out)
	if err == nil || !strings.Contains(err.Error(), "400") || strings.Contains(err.Error(), "s3cretkey") {
		t.Fatalf("err = %v", err)
	}
	withGeminiServer(t, func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte(`{"candidates":[{"content":{"parts":[{"text":"not json"}]}}]}`))
	})
	if err := generateJSON(context.Background(), "k", "m", "", []geminiPart{{Text: "x"}}, nil, &out); err == nil {
		t.Fatal("malformed model output should error")
	}
	withGeminiServer(t, func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte(`{"candidates":[],"promptFeedback":{"blockReason":"SAFETY"}}`))
	})
	if err := generateJSON(context.Background(), "k", "m", "", []geminiPart{{Text: "x"}}, nil, &out); err == nil || !strings.Contains(err.Error(), "SAFETY") {
		t.Fatalf("blocked err = %v", err)
	}
}

func TestCreateLiveToken(t *testing.T) {
	now := time.Date(2026, 10, 1, 12, 0, 0, 0, time.UTC)
	withGeminiServer(t, func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost || r.URL.Path != "/v1beta/auth_tokens" || r.Header.Get("x-goog-api-key") != "k3y" {
			t.Errorf("request %s %s", r.Method, r.URL.Path)
		}
		raw, _ := io.ReadAll(r.Body)
		var body map[string]any
		json.Unmarshal(raw, &body)
		if body["uses"] != float64(0) || body["expireTime"] != "2026-10-01T12:55:00Z" || body["newSessionExpireTime"] != "2026-10-01T12:55:00Z" {
			t.Errorf("times/uses = %v", body)
		}
		mask, _ := body["fieldMask"].(string)
		if !strings.Contains(mask, "systemInstruction") || strings.Contains(mask, "sessionResumption") {
			t.Errorf("fieldMask = %q", mask)
		}
		setup := body["bidiGenerateContentSetup"].(map[string]any)
		if setup["model"] != "models/gemini-3.8-live" {
			t.Errorf("setup = %v", setup)
		}
		// Google rejects a locked setup containing fields outside fieldMask (400).
		for k := range setup {
			if !strings.Contains(","+mask+",", ","+k+",") {
				t.Errorf("setup field %q is not in fieldMask %q", k, mask)
			}
		}
		w.Write([]byte(`{"name":"auth_tokens/abc123"}`))
	})
	setup := map[string]any{"model": "models/gemini-3.8-live", "sessionResumption": map[string]any{}, "systemInstruction": map[string]any{}}
	tok, err := createLiveToken(context.Background(), "k3y", setup, 25, now)
	if err != nil || tok != "auth_tokens/abc123" {
		t.Fatalf("tok=%q err=%v", tok, err)
	}
	if _, ok := setup["sessionResumption"]; !ok {
		t.Fatal("the caller's setup must not be modified; the page still sends sessionResumption")
	}
}

func TestGeminiRetriesBusyErrors(t *testing.T) {
	calls := 0
	withGeminiServer(t, func(w http.ResponseWriter, r *http.Request) {
		calls++
		if calls < 3 {
			http.Error(w, `{"error":{"message":"This model is currently experiencing high demand."}}`, http.StatusServiceUnavailable)
			return
		}
		w.Write([]byte(`{"candidates":[{"content":{"parts":[{"text":"{\"ok\":true}"}]}}]}`))
	})
	var out struct{ OK bool }
	if err := generateJSON(context.Background(), "k", "m", "", []geminiPart{{Text: "x"}}, nil, &out); err != nil || !out.OK || calls != 3 {
		t.Fatalf("calls=%d out=%+v err=%v", calls, out, err)
	}

	calls = 0
	withGeminiServer(t, func(w http.ResponseWriter, r *http.Request) {
		calls++
		http.Error(w, "busy", http.StatusTooManyRequests)
	})
	if err := generateJSON(context.Background(), "k", "m", "", []geminiPart{{Text: "x"}}, nil, &out); err == nil || calls != 3 {
		t.Fatalf("should give up after 3 tries: calls=%d err=%v", calls, err)
	}

	calls = 0
	withGeminiServer(t, func(w http.ResponseWriter, r *http.Request) {
		calls++
		http.Error(w, "bad key", http.StatusBadRequest)
	})
	generateJSON(context.Background(), "k", "m", "", []geminiPart{{Text: "x"}}, nil, &out)
	if calls != 1 {
		t.Fatalf("other errors must not be retried: calls=%d", calls)
	}
}
