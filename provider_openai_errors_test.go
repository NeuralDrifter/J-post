// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

package main

import (
	"net"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"jobtrack/internal/settings"
)

// errorFor runs the custom provider against one reply and returns its error.
// The key is sk-test-secret; no message may contain it.
func errorFor(t *testing.T, reply fakeReply) string {
	t.Helper()
	_, srv := newFakeOpenAI(t, reply)
	_, err := runProvider(t, settings.ProviderOpenAICompatible, customSettings(srv, settings.ModePlain))
	if err == nil {
		t.Fatal("want an error")
	}
	if strings.Contains(err.Error(), "sk-test-secret") {
		t.Fatalf("key leaked: %v", err)
	}
	return err.Error()
}

func wantMessage(t *testing.T, got, want string) {
	t.Helper()
	if !strings.Contains(got, want) {
		t.Fatalf("error = %q, want it to contain %q", got, want)
	}
}

const customLabel = "OpenAI-compatible (custom)"

func TestOpenAIBadKey(t *testing.T) {
	wantMessage(t, errorFor(t, errorReply(401, "Incorrect API key provided: sk-test-secret")), customLabel+" rejected the API key")
	wantMessage(t, errorFor(t, errorReply(403, "forbidden")), customLabel+" rejected the API key")
}

func TestOpenAIUnknownModel(t *testing.T) {
	wantMessage(t, errorFor(t, errorReply(404, "The model `m1` does not exist")), customLabel+" doesn't have the model m1")
	// DeepSeek reports an unknown model as a 400.
	wantMessage(t, errorFor(t, errorReply(400, "Model Not Exist")), customLabel+" doesn't have the model m1")
}

func TestOpenAIOutOfCredit(t *testing.T) {
	wantMessage(t, errorFor(t, errorReply(402, "Insufficient Balance")), customLabel+" says the account is out of credit")
}

func TestOpenAIRateLimitedRetryAfter(t *testing.T) {
	r := errorReply(429, "Rate limit reached")
	r.header = map[string]string{"retry-after": "20"}
	got := errorFor(t, r)
	wantMessage(t, got, customLabel+" is rate limiting requests")
	wantMessage(t, got, "try again in 20 s")
}

func TestOpenAIUnsupportedResponseFormat(t *testing.T) {
	got := errorFor(t, errorReply(400, "This response_format type is unavailable now"))
	wantMessage(t, got, "doesn't accept this answer mode")
	wantMessage(t, got, "plain")
}

func TestOpenAIServerError(t *testing.T) {
	wantMessage(t, errorFor(t, errorReply(503, "overloaded")), customLabel+" is unavailable right now")
}

func TestOpenAIOtherErrorShowsServerMessage(t *testing.T) {
	wantMessage(t, errorFor(t, errorReply(400, "messages: too long")), "messages: too long")
}

func TestOpenAIConnectionRefused(t *testing.T) {
	newFakeOpenAI(t, chatReply("m", validNudge)) // resets the test hooks
	l, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	addr := "http://" + l.Addr().String() + "/v1"
	l.Close()
	start := time.Now()
	_, err = runProvider(t, settings.ProviderOllama, settings.Settings{OllamaURL: addr, OllamaModel: "llama"})
	if err == nil || err.Error() != "Ollama isn't running at "+addr {
		t.Fatalf("err = %v", err)
	}
	if time.Since(start) > 5*time.Second {
		t.Fatal("a refused connection should fail fast")
	}
	_, err = runProvider(t, settings.ProviderLMStudio, settings.Settings{LMStudioURL: addr, LMStudioModel: "m"})
	wantMessage(t, err.Error(), "LM Studio isn't running at "+addr)
	_, err = runProvider(t, settings.ProviderOpenAICompatible, settings.Settings{CustomAIBaseURL: addr, CustomAIModel: "m", CustomAIMode: "plain"})
	wantMessage(t, err.Error(), "Couldn't reach "+customLabel+" at "+addr)
}

func TestOpenAITimeout(t *testing.T) {
	newFakeOpenAI(t, chatReply("m", validNudge)) // resets the test hooks
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		select {
		case <-r.Context().Done():
		case <-time.After(time.Second):
		}
	}))
	t.Cleanup(srv.Close)
	old := openAITimeout[roleTips]
	openAITimeout[roleTips] = 100 * time.Millisecond
	t.Cleanup(func() { openAITimeout[roleTips] = old })
	_, err := runProvider(t, settings.ProviderOpenAICompatible, customSettings(srv, settings.ModePlain))
	if err == nil {
		t.Fatal("want a timeout")
	}
	wantMessage(t, err.Error(), customLabel+" took too long to answer")
}

// LM Studio can require a token; without one the user needs to know where to set it.
func TestLMStudioTokenRequired(t *testing.T) {
	_, srv := newFakeOpenAI(t, errorReply(401, "An LM Studio API token is required to make requests to this server"))
	_, err := runProvider(t, settings.ProviderLMStudio, settings.Settings{LMStudioURL: srv.URL + "/v1", LMStudioModel: "m"})
	wantMessage(t, err.Error(), "LM Studio (local) needs an API token")
	// With a token that's wrong, it's the usual message.
	_, err = runProvider(t, settings.ProviderLMStudio, settings.Settings{LMStudioURL: srv.URL + "/v1", LMStudioKey: "bad", LMStudioModel: "m"})
	wantMessage(t, err.Error(), "LM Studio (local) rejected the API key")
}
