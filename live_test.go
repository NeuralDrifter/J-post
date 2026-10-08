// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

package main

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gorilla/websocket"
)

// fakeLiveServer accepts Live connections, hands handle the parsed setup message
// and the connection, and points geminiLiveWSBase at itself.
func fakeLiveServer(t *testing.T, handle func(c *websocket.Conn, setup map[string]any)) {
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
	old := geminiLiveWSBase
	geminiLiveWSBase = "ws" + strings.TrimPrefix(srv.URL, "http")
	t.Cleanup(func() { geminiLiveWSBase = old })
}

// replyWithToolCall completes setup, reads the prompt turn, and answers with a
// submit_result call carrying args.
func replyWithToolCall(t *testing.T, args map[string]any, sawPrompt *string) func(*websocket.Conn, map[string]any) {
	return func(c *websocket.Conn, setup map[string]any) {
		c.WriteJSON(map[string]any{"setupComplete": map[string]any{}})
		var turn map[string]any
		c.ReadJSON(&turn)
		if sawPrompt != nil {
			parts := turn["clientContent"].(map[string]any)["turns"].([]any)[0].(map[string]any)["parts"].([]any)
			*sawPrompt = parts[0].(map[string]any)["text"].(string)
		}
		c.WriteJSON(map[string]any{"toolCall": map[string]any{"functionCalls": []any{
			map[string]any{"id": "call-1", "name": liveResultTool, "args": args},
		}}})
		c.ReadMessage() // wait for the client to close
	}
}
