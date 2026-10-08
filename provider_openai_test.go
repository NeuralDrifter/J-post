package main

import (
	"encoding/json"
	"strings"
	"testing"
)

func TestOpenAIProviderUnavailableReasons(t *testing.T) {
	cases := []struct {
		id   string
		s    Settings
		want string
	}{
		{providerOpenAI, Settings{OpenAIModel: "m"}, "Add your OpenAI API key in Settings → AI"},
		{providerOpenAI, Settings{OpenAIKey: "k"}, "Choose a model for OpenAI in Settings → AI"},
		{providerOpenAI, Settings{OpenAIKey: "k", OpenAIModel: "m"}, ""},
		{providerDeepSeek, Settings{DeepSeekModel: "m"}, "Add your DeepSeek API key in Settings → AI"},
		{providerDeepSeek, Settings{DeepSeekKey: "k"}, "Choose a model for DeepSeek in Settings → AI"},
		{providerDeepSeek, Settings{DeepSeekKey: "k", DeepSeekModel: "m"}, ""},
		{providerOllama, Settings{OllamaURL: defaultOllamaURL}, "Choose a model for Ollama (local) in Settings → AI"},
		{providerOllama, Settings{OllamaURL: defaultOllamaURL, OllamaModel: "llama"}, ""},
		{providerOpenAICompatible, Settings{CustomAIModel: "m"}, "Enter the server address in Settings → AI"},
		{providerOpenAICompatible, Settings{CustomAIBaseURL: "http://x/v1"}, "Choose a model for OpenAI-compatible (custom) in Settings → AI"},
		{providerOpenAICompatible, Settings{CustomAIBaseURL: "http://x/v1", CustomAIModel: "m"}, ""},
	}
	for _, c := range cases {
		p, ok := providerByID(c.id)
		if !ok {
			t.Fatalf("provider %q not registered", c.id)
		}
		if got := p.unavailable(c.s); got != c.want {
			t.Errorf("%s %+v: unavailable = %q, want %q", c.id, c.s, got, c.want)
		}
	}
}

func TestAIProvidersOrder(t *testing.T) {
	want := []string{providerGeminiLive, providerAnthropic, providerClaudeCode, "openai", "deepseek", "ollama", "openai-compatible"}
	var got []string
	for _, p := range aiProviders() {
		got = append(got, p.id())
	}
	if len(got) != len(want) {
		t.Fatalf("ids = %v, want %v", got, want)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("ids = %v, want %v", got, want)
		}
	}
}

func TestOpenAIPresetConnections(t *testing.T) {
	s := Settings{
		OpenAIKey: "ok", OpenAIModel: "om", DeepSeekKey: "dk", DeepSeekModel: "dm",
		OllamaURL: "http://box:11434/v1", OllamaModel: "lm",
		CustomAIBaseURL: "http://c/v1", CustomAIKey: "ck", CustomAIModel: "cm", CustomAIMode: "json_object",
	}
	want := map[string]openAIConn{
		providerOpenAI:           {baseURL: "https://api.openai.com/v1", key: "ok", model: "om", mode: modeJSONSchema},
		providerDeepSeek:         {baseURL: "https://api.deepseek.com/v1", key: "dk", model: "dm", mode: modeJSONObject},
		providerOllama:           {baseURL: "http://box:11434/v1", key: "", model: "lm", mode: modeJSONSchema},
		providerOpenAICompatible: {baseURL: "http://c/v1", key: "ck", model: "cm", mode: modeJSONObject},
	}
	for _, preset := range openAIPresets {
		if got := preset.conn(s); got != want[preset.id] {
			t.Errorf("%s conn = %+v, want %+v", preset.id, got, want[preset.id])
		}
	}
}

func TestOpenAIJSONSchemaRequest(t *testing.T) {
	f, srv := newFakeOpenAI(t, chatReply("m1", validNudge))
	res, err := runProvider(t, providerOpenAICompatible, customSettings(srv, modeJSONSchema))
	if err != nil {
		t.Fatal(err)
	}
	rf, _ := f.bodies[0]["response_format"].(map[string]any)
	js, _ := rf["json_schema"].(map[string]any)
	if rf["type"] != "json_schema" || js["strict"] != true || js["name"] != "nudge" || js["schema"] == nil {
		t.Fatalf("response_format = %v", rf)
	}
	if got := systemMessage(f.bodies[0]); got != nudgeInstruction {
		t.Fatalf("system message should be the instruction alone, got %q", got)
	}
	var out struct{ Nudge, Kind string }
	if json.Unmarshal(res.raw, &out); out.Kind != "tip" || out.Nudge == "" {
		t.Fatalf("raw = %s", res.raw)
	}
}

func TestOpenAIJSONObjectRequest(t *testing.T) {
	f, srv := newFakeOpenAI(t, chatReply("m1", validNudge))
	s := customSettings(srv, modeJSONObject)
	for range 2 {
		if _, err := runProvider(t, providerOpenAICompatible, s); err != nil {
			t.Fatal(err)
		}
	}
	rf, _ := f.bodies[0]["response_format"].(map[string]any)
	if rf["type"] != "json_object" {
		t.Fatalf("response_format = %v", rf)
	}
	sys := systemMessage(f.bodies[0])
	if !strings.HasPrefix(sys, nudgeInstruction) || !strings.Contains(sys, "json") || !strings.Contains(sys, `"additionalProperties"`) {
		t.Fatalf("system message should be the instruction plus the schema, got %q", sys)
	}
	// The cacheable prefix must not change between runs.
	if systemMessage(f.bodies[1]) != sys {
		t.Fatal("system message differs between runs")
	}
}

func TestOpenAIPlainRequest(t *testing.T) {
	f, srv := newFakeOpenAI(t, chatReply("m1", validNudge))
	if _, err := runProvider(t, providerOpenAICompatible, customSettings(srv, modePlain)); err != nil {
		t.Fatal(err)
	}
	if rf, ok := f.bodies[0]["response_format"]; ok {
		t.Fatalf("plain mode must not send response_format: %v", rf)
	}
	if !strings.Contains(systemMessage(f.bodies[0]), "json") {
		t.Fatal("plain mode must ask for json in the instruction")
	}
	if f.paths[0] != "/v1/chat/completions" {
		t.Fatalf("path = %s", f.paths[0])
	}
}

func TestOpenAIDeepSeekPreset(t *testing.T) {
	f, srv := newFakeOpenAI(t, chatReply("deepseek-chat", validNudge))
	openAIBaseURLOverride = srv.URL + "/v1"
	res, err := runProvider(t, providerDeepSeek, Settings{DeepSeekKey: "dk", DeepSeekModel: "deepseek-chat"})
	if err != nil {
		t.Fatal(err)
	}
	b := f.bodies[0]
	rf, _ := b["response_format"].(map[string]any)
	if rf["type"] != "json_object" || b["max_tokens"] != float64(1024) || b["max_completion_tokens"] != nil {
		t.Fatalf("body = %v", b)
	}
	if res.model != "deepseek-chat" {
		t.Fatalf("model = %q", res.model)
	}
	if got := f.headers[0].Get("Authorization"); got != "Bearer dk" {
		t.Fatalf("Authorization = %q", got)
	}
}

func TestOpenAIPresetUsesMaxCompletionTokens(t *testing.T) {
	f, srv := newFakeOpenAI(t, chatReply("gpt-x", validNudge))
	openAIBaseURLOverride = srv.URL + "/v1"
	if _, err := runProvider(t, providerOpenAI, Settings{OpenAIKey: "ok", OpenAIModel: "gpt-x"}); err != nil {
		t.Fatal(err)
	}
	if f.bodies[0]["max_completion_tokens"] != float64(1024) || f.bodies[0]["max_tokens"] != nil {
		t.Fatalf("body = %v", f.bodies[0])
	}
}

func TestOpenAIProseAnswerParses(t *testing.T) {
	f, srv := newFakeOpenAI(t, chatReply("m1", "Sure! ```json\n"+validNudge+"\n```"))
	if _, err := runProvider(t, providerOpenAICompatible, customSettings(srv, modePlain)); err != nil {
		t.Fatal(err)
	}
	if f.requests() != 1 {
		t.Fatalf("requests = %d, want 1", f.requests())
	}
}

func TestOpenAIEmptyAnswerIsRepaired(t *testing.T) {
	f, srv := newFakeOpenAI(t, chatReply("m1", ""), chatReply("m1", validNudge))
	if _, err := runProvider(t, providerOpenAICompatible, customSettings(srv, modeJSONObject)); err != nil {
		t.Fatal(err)
	}
	if f.requests() != 2 {
		t.Fatalf("requests = %d, want 2", f.requests())
	}
	msgs := f.bodies[1]["messages"].([]any)
	last := msgs[len(msgs)-1].(map[string]any)
	if last["role"] != "user" || !strings.Contains(last["content"].(string), "wasn't valid") {
		t.Fatalf("repair message = %v", last)
	}
}

func TestOpenAIInvalidTwiceFails(t *testing.T) {
	f, srv := newFakeOpenAI(t, chatReply("m1", `{"kind": "great"}`))
	_, err := runProvider(t, providerOpenAICompatible, customSettings(srv, modeJSONObject))
	if err == nil || !strings.Contains(err.Error(), "wasn't in the expected format") {
		t.Fatalf("err = %v", err)
	}
	if f.requests() != 2 {
		t.Fatalf("requests = %d, want 2", f.requests())
	}
}

func TestOpenAIReportsModel(t *testing.T) {
	_, srv := newFakeOpenAI(t, chatReply("m1-2026-10-01", validNudge))
	res, err := runProvider(t, providerOpenAICompatible, customSettings(srv, modePlain))
	if err != nil || res.model != "m1-2026-10-01" {
		t.Fatalf("model = %q, %v", res.model, err)
	}
}

func TestOpenAINoKeyForOllama(t *testing.T) {
	f, srv := newFakeOpenAI(t, chatReply("llama", validNudge))
	if _, err := runProvider(t, providerOllama, Settings{OllamaURL: srv.URL + "/v1", OllamaModel: "llama"}); err != nil {
		t.Fatal(err)
	}
	if auth := f.headers[0].Get("Authorization"); strings.Contains(auth, "sk-") {
		t.Fatalf("Authorization = %q", auth)
	}
}

// OPENAI_* environment variables must never reach DeepSeek, Ollama or a custom server.
func TestOpenAIIgnoresOpenAIEnvironment(t *testing.T) {
	t.Setenv("OPENAI_API_KEY", "sk-env-leak")
	t.Setenv("OPENAI_ORG_ID", "org-leak")
	t.Setenv("OPENAI_CUSTOM_HEADERS", "X-Leak: yes")
	f, srv := newFakeOpenAI(t, chatReply("llama", validNudge))
	if _, err := runProvider(t, providerOllama, Settings{OllamaURL: srv.URL + "/v1", OllamaModel: "llama"}); err != nil {
		t.Fatal(err)
	}
	h := f.headers[0]
	if strings.Contains(h.Get("Authorization"), "sk-env-leak") || h.Get("OpenAI-Organization") != "" || h.Get("X-Leak") != "" {
		t.Fatalf("environment leaked into the request: %v", h)
	}
}
