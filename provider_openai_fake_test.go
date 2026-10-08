// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

package main

import (
	"cmp"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"

	"jobtrack/internal/settings"
)

// fakeOpenAI is an OpenAI-style server that records requests and answers with
// queued replies (the last one repeats).
type fakeOpenAI struct {
	mu      sync.Mutex
	paths   []string
	bodies  []map[string]any
	headers []http.Header
	replies []fakeReply
}

type fakeReply struct {
	status int
	body   string
	header map[string]string
}

func newFakeOpenAI(t *testing.T, replies ...fakeReply) (*fakeOpenAI, *httptest.Server) {
	t.Helper()
	f := &fakeOpenAI{replies: replies}
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		raw, _ := io.ReadAll(r.Body)
		var body map[string]any
		json.Unmarshal(raw, &body)
		f.mu.Lock()
		f.paths = append(f.paths, r.URL.Path)
		f.bodies = append(f.bodies, body)
		f.headers = append(f.headers, r.Header.Clone())
		reply := f.replies[min(len(f.bodies), len(f.replies))-1]
		f.mu.Unlock()
		for k, v := range reply.header {
			w.Header().Set(k, v)
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(cmp.Or(reply.status, http.StatusOK))
		io.WriteString(w, reply.body)
	}))
	t.Cleanup(srv.Close)
	oldURL, oldRetries := openAIBaseURLOverride, openAIMaxRetries
	openAIBaseURLOverride, openAIMaxRetries = "", 0
	t.Cleanup(func() { openAIBaseURLOverride, openAIMaxRetries = oldURL, oldRetries })
	return f, srv
}

func (f *fakeOpenAI) requests() int {
	f.mu.Lock()
	defer f.mu.Unlock()
	return len(f.bodies)
}

// chatReply is a Chat Completions response whose message content is content.
func chatReply(model, content string) fakeReply {
	c, _ := json.Marshal(content)
	return fakeReply{body: `{"id":"x","object":"chat.completion","created":1,"model":"` + model +
		`","choices":[{"index":0,"message":{"role":"assistant","content":` + string(c) +
		`},"finish_reason":"stop"}],"usage":{"prompt_tokens":10,"completion_tokens":5,"total_tokens":15}}`}
}

func errorReply(status int, message string) fakeReply {
	m, _ := json.Marshal(message)
	return fakeReply{status: status, body: `{"error":{"message":` + string(m) + `,"type":"invalid_request_error"}}`}
}

const validNudge = `{"nudge": "Lead with the result", "kind": "tip"}`

// customSettings points the custom provider at srv in the given answer mode.
func customSettings(srv *httptest.Server, mode settings.AnswerMode) settings.Settings {
	return settings.Settings{CustomAIBaseURL: srv.URL + "/v1", CustomAIKey: "sk-test-secret", CustomAIModel: "m1", CustomAIMode: string(mode)}
}

func runProvider(t *testing.T, id string, s settings.Settings) (aiResult, error) {
	t.Helper()
	p, ok := providerByID(id)
	if !ok {
		t.Fatalf("no provider %q", id)
	}
	return p.run(context.Background(), s, testNudgeTask("Why us?", "Because."))
}

func systemMessage(body map[string]any) string {
	msgs, _ := body["messages"].([]any)
	if len(msgs) == 0 {
		return ""
	}
	first, _ := msgs[0].(map[string]any)
	if first["role"] != "system" {
		return ""
	}
	s, _ := first["content"].(string)
	return s
}
