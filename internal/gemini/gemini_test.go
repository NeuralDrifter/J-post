// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

package gemini

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
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
	tok, err := CreateLiveToken(context.Background(), "k3y", setup, 25, now)
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
		w.Write([]byte(`{"ok":true}`))
	})
	var out struct{ OK bool }
	if err := geminiPost(context.Background(), "k", "/x", map[string]any{}, &out); err != nil || !out.OK || calls != 3 {
		t.Fatalf("calls=%d out=%+v err=%v", calls, out, err)
	}

	calls = 0
	withGeminiServer(t, func(w http.ResponseWriter, r *http.Request) {
		calls++
		http.Error(w, "busy", http.StatusTooManyRequests)
	})
	if err := geminiPost(context.Background(), "k", "/x", map[string]any{}, &out); err == nil || calls != 3 {
		t.Fatalf("should give up after 3 tries: calls=%d err=%v", calls, err)
	}

	calls = 0
	withGeminiServer(t, func(w http.ResponseWriter, r *http.Request) {
		calls++
		http.Error(w, "bad key", http.StatusBadRequest)
	})
	geminiPost(context.Background(), "k", "/x", map[string]any{}, &out)
	if calls != 1 {
		t.Fatalf("other errors must not be retried: calls=%d", calls)
	}
}

func fakeServer(t *testing.T, handler http.HandlerFunc) string {
	srv := httptest.NewServer(handler)
	t.Cleanup(srv.Close)
	return srv.URL
}
