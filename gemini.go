package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"time"
)

// Gemini REST client. The API key travels in the x-goog-api-key header only,
// so it never appears in URLs or error messages.
var (
	geminiBaseURL = "https://generativelanguage.googleapis.com"
	geminiTimeout = 120 * time.Second
	// Waits before retrying "high demand" (503) and rate-limit (429) errors.
	geminiRetryDelays = []time.Duration{2 * time.Second, 5 * time.Second}
)

// geminiLiveURL is where the frontend opens the voice session with an ephemeral token.
const geminiLiveURL = "wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContentConstrained"

// liveLockedFields are fixed by the token; sessionResumption stays with the
// client so it can reconnect with a handle.
const liveLockedFields = "model,generationConfig,systemInstruction,inputAudioTranscription,outputAudioTranscription,contextWindowCompression,realtimeInputConfig"

var errNoGeminiKey = errors.New("add your Gemini API key in Settings → AI first")

type geminiBlob struct {
	MimeType string `json:"mimeType"`
	Data     string `json:"data"` // base64
}

type geminiPart struct {
	Text       string      `json:"text,omitempty"`
	InlineData *geminiBlob `json:"inlineData,omitempty"`
}

func geminiPost(ctx context.Context, key, path string, body any, out any) error {
	if key == "" {
		return errNoGeminiKey
	}
	payload, err := json.Marshal(body)
	if err != nil {
		return err
	}
	for attempt := 0; ; attempt++ {
		status, err := geminiPostOnce(ctx, key, path, payload, out)
		busy := status == http.StatusServiceUnavailable || status == http.StatusTooManyRequests
		if err == nil || !busy || attempt >= len(geminiRetryDelays) {
			return err
		}
		select {
		case <-ctx.Done():
			return err
		case <-time.After(geminiRetryDelays[attempt]):
		}
	}
}

func geminiPostOnce(ctx context.Context, key, path string, payload []byte, out any) (int, error) {
	resp, err := apiRequest{
		source:  "Gemini",
		method:  http.MethodPost,
		url:     geminiBaseURL + path,
		headers: map[string]string{"Content-Type": "application/json", "x-goog-api-key": key},
		body:    payload,
		timeout: geminiTimeout,
	}.send(ctx)
	if err != nil {
		return 0, err
	}
	if resp.status != http.StatusOK {
		return resp.status, fmt.Errorf("Gemini error %d: %s", resp.status, truncate(strings.ReplaceAll(geminiErrorText(resp.body), key, "[key]"), 300))
	}
	if err := json.Unmarshal(resp.body, out); err != nil {
		return resp.status, fmt.Errorf("unexpected Gemini response: %v", err)
	}
	return resp.status, nil
}

// geminiErrorText prefers the API's error.message over the raw body.
func geminiErrorText(body []byte) string {
	var e struct {
		Error struct {
			Message string `json:"message"`
		} `json:"error"`
	}
	if json.Unmarshal(body, &e) == nil && e.Error.Message != "" {
		return e.Error.Message
	}
	return strings.TrimSpace(string(body))
}

// generateJSON asks a text model for JSON matching schema and decodes it into out.
func generateJSON(ctx context.Context, key, model, system string, parts []geminiPart, schema map[string]any, out any) error {
	body := map[string]any{
		"contents":         []any{map[string]any{"role": "user", "parts": parts}},
		"generationConfig": map[string]any{"responseMimeType": "application/json"},
	}
	if schema != nil {
		body["generationConfig"].(map[string]any)["responseSchema"] = schema
	}
	if system != "" {
		body["systemInstruction"] = map[string]any{"parts": []geminiPart{{Text: system}}}
	}
	var resp struct {
		Candidates []struct {
			Content struct {
				Parts []struct {
					Text string `json:"text"`
				} `json:"parts"`
			} `json:"content"`
			FinishReason string `json:"finishReason"`
		} `json:"candidates"`
		PromptFeedback struct {
			BlockReason string `json:"blockReason"`
		} `json:"promptFeedback"`
	}
	if err := geminiPost(ctx, key, "/v1beta/models/"+url.PathEscape(model)+":generateContent", body, &resp); err != nil {
		return err
	}
	if len(resp.Candidates) == 0 {
		if resp.PromptFeedback.BlockReason != "" {
			return fmt.Errorf("Gemini declined the request (%s)", resp.PromptFeedback.BlockReason)
		}
		return errors.New("Gemini returned no answer")
	}
	var text strings.Builder
	for _, p := range resp.Candidates[0].Content.Parts {
		text.WriteString(p.Text)
	}
	if err := json.Unmarshal([]byte(text.String()), out); err != nil {
		return fmt.Errorf("Gemini's answer wasn't valid JSON (finish reason %s)", resp.Candidates[0].FinishReason)
	}
	return nil
}

// createLiveToken mints a short-lived token that locks the session's setup
// (model, voice, brief) so the page never holds the real API key.
func createLiveToken(ctx context.Context, key string, setup map[string]any, minutes int, now time.Time) (string, error) {
	expires := now.Add(time.Duration(minutes)*time.Minute + 30*time.Minute).UTC().Format(time.RFC3339)
	// The locked setup may only contain fields named in fieldMask (Google returns
	// 400 otherwise); the rest, e.g. sessionResumption, comes from the page.
	locked := map[string]any{}
	for _, field := range strings.Split(liveLockedFields, ",") {
		if v, ok := setup[field]; ok {
			locked[field] = v
		}
	}
	body := map[string]any{
		"uses":                     0, // unlimited: reconnects open new sessions
		"expireTime":               expires,
		"newSessionExpireTime":     expires,
		"bidiGenerateContentSetup": locked,
		"fieldMask":                liveLockedFields,
	}
	var resp struct {
		Name string `json:"name"`
	}
	if err := geminiPost(ctx, key, "/v1beta/auth_tokens", body, &resp); err != nil {
		return "", err
	}
	if resp.Name == "" {
		return "", errors.New("Gemini didn't return a session token")
	}
	return resp.Name, nil
}
