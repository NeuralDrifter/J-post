// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

// Package geminitest provides fake Gemini REST and Live servers for tests in
// other packages, in the style of net/http/httptest.
package geminitest

import (
	"encoding/base64"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gorilla/websocket"

	"jobtrack/internal/gemini"
)

// WithServer serves Gemini REST calls from h until the test ends, with no retry delays.
func WithServer(t *testing.T, h http.HandlerFunc) {
	srv := httptest.NewServer(h)
	t.Cleanup(srv.Close)
	gemini.SetTestEndpoints(t, srv.URL, "")
}

// FakeLiveServer accepts Live connections, hands handle the parsed setup message
// and the connection, and points Live sessions at itself.
func FakeLiveServer(t *testing.T, handle func(c *websocket.Conn, setup map[string]any)) {
	upgrader := websocket.Upgrader{}
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		c, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			return
		}
		defer c.Close()
		var msg map[string]any
		if err := c.ReadJSON(&msg); err != nil {
			return
		}
		handle(c, msg["setup"].(map[string]any))
	}))
	t.Cleanup(srv.Close)
	gemini.SetTestEndpoints(t, "", "ws"+strings.TrimPrefix(srv.URL, "http"))
}

// ReplyWithToolCall completes setup, reads the prompt turn, and answers with a
// submit_result call carrying args.
func ReplyWithToolCall(t *testing.T, args map[string]any, sawPrompt *string) func(*websocket.Conn, map[string]any) {
	return func(c *websocket.Conn, setup map[string]any) {
		c.WriteJSON(map[string]any{"setupComplete": map[string]any{}})
		var turn map[string]any
		c.ReadJSON(&turn)
		if sawPrompt != nil {
			parts := turn["clientContent"].(map[string]any)["turns"].([]any)[0].(map[string]any)["parts"].([]any)
			*sawPrompt = parts[0].(map[string]any)["text"].(string)
		}
		c.WriteJSON(map[string]any{"toolCall": map[string]any{"functionCalls": []any{
			map[string]any{"id": "call-1", "name": gemini.LiveResultTool, "args": args},
		}}})
		c.ReadMessage() // wait for the client to close
	}
}

// FakeLiveAudio is a minimal Live API server: setup → setupComplete, text turn →
// audio chunks → turnComplete. It counts connections and records the voice asked for.
func FakeLiveAudio(t *testing.T, chunks [][]byte, calls *int, sawVoice *string) {
	upgrader := websocket.Upgrader{}
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		*calls++
		if r.URL.Query().Get("key") != "k3y" {
			t.Errorf("missing key param: %s", r.URL.RawQuery)
		}
		c, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			return
		}
		defer c.Close()
		var setup map[string]any
		c.ReadJSON(&setup)
		gc := setup["setup"].(map[string]any)["generationConfig"].(map[string]any)
		*sawVoice = gc["speechConfig"].(map[string]any)["voiceConfig"].(map[string]any)["prebuiltVoiceConfig"].(map[string]any)["voiceName"].(string)
		c.WriteJSON(map[string]any{"setupComplete": map[string]any{}})
		var turn map[string]any
		c.ReadJSON(&turn)
		for _, ch := range chunks {
			msg, _ := json.Marshal(map[string]any{"serverContent": map[string]any{"modelTurn": map[string]any{"parts": []any{
				map[string]any{"inlineData": map[string]any{"mimeType": "audio/pcm;rate=24000", "data": base64.StdEncoding.EncodeToString(ch)}},
			}}}})
			c.WriteMessage(websocket.BinaryMessage, msg) // Live sends JSON in binary frames
		}
		c.WriteJSON(map[string]any{"serverContent": map[string]any{"turnComplete": true}})
		c.ReadMessage() // wait for the client to close
	}))
	t.Cleanup(srv.Close)
	gemini.SetTestEndpoints(t, "", "ws"+strings.TrimPrefix(srv.URL, "http"))
}
