// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

package main

import (
	"context"
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

func TestLiveStructuredReturnsToolCallArgs(t *testing.T) {
	var prompt string
	var declared map[string]any
	fakeLiveServer(t, func(c *websocket.Conn, setup map[string]any) {
		if setup["model"] != "models/gemini-3.8-live" {
			t.Errorf("model = %v", setup["model"])
		}
		tools := setup["tools"].([]any)[0].(map[string]any)["functionDeclarations"].([]any)
		declared = tools[0].(map[string]any)
		replyWithToolCall(t, map[string]any{"nudge": "Lead with the result", "kind": "tip"}, &prompt)(c, setup)
	})
	var n Nudge
	err := liveStructured(context.Background(), "k3y", jsonPrompt{model: "gemini-3.8-live", system: "coach", parts: []geminiPart{{Text: "the answer"}}, schema: geminiSchema(nudgeSchema)}, &n)
	if err != nil || n.Nudge != "Lead with the result" || n.Kind != "tip" {
		t.Fatalf("n = %+v, err = %v", n, err)
	}
	if declared["name"] != liveResultTool || declared["parameters"] == nil || prompt != "the answer" {
		t.Fatalf("declared = %v, prompt = %q", declared, prompt)
	}
}

func TestLiveStructuredWithoutToolCallFails(t *testing.T) {
	fakeLiveServer(t, func(c *websocket.Conn, setup map[string]any) {
		c.WriteJSON(map[string]any{"setupComplete": map[string]any{}})
		c.ReadMessage()
		c.WriteJSON(map[string]any{"serverContent": map[string]any{"turnComplete": true}})
		c.ReadMessage()
	})
	var n Nudge
	if err := liveStructured(context.Background(), "k", jsonPrompt{model: "m", parts: []geminiPart{{Text: "x"}}, schema: geminiSchema(nudgeSchema)}, &n); err == nil {
		t.Fatal("a turn with no tool call should fail")
	}
}

func TestLiveStructuredErrors(t *testing.T) {
	var n Nudge
	if err := liveStructured(context.Background(), "", jsonPrompt{model: "m"}, &n); err != errNoGeminiKey {
		t.Fatalf("no key: %v", err)
	}
	old := geminiLiveWSBase
	geminiLiveWSBase = "ws://127.0.0.1:1"
	t.Cleanup(func() { geminiLiveWSBase = old })
	if err := liveStructured(context.Background(), "s3cretkey", jsonPrompt{model: "m"}, &n); err == nil || strings.Contains(err.Error(), "s3cretkey") {
		t.Fatalf("unreachable: %v", err)
	}
}
