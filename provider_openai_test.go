package main

import (
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
