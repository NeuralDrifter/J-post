package main

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/binary"
	"errors"
	"fmt"
	"net/url"
	"os"
	"path/filepath"
	"strings"
)

// VoiceOption is one of Google's prebuilt voices (usable by Live and TTS models).
type VoiceOption struct {
	Name  string `json:"name"`
	Style string `json:"style"`
}

// interviewVoiceList is Google's prebuilt voice catalog (Gemini speech-generation docs).
var interviewVoiceList = []VoiceOption{
	{"Zephyr", "Bright"}, {"Puck", "Upbeat"}, {"Charon", "Informative"}, {"Kore", "Firm"}, {"Fenrir", "Excitable"},
	{"Leda", "Youthful"}, {"Orus", "Firm"}, {"Aoede", "Breezy"}, {"Callirrhoe", "Easy-going"}, {"Autonoe", "Bright"},
	{"Enceladus", "Breathy"}, {"Iapetus", "Clear"}, {"Umbriel", "Easy-going"}, {"Algieba", "Smooth"}, {"Despina", "Smooth"},
	{"Erinome", "Clear"}, {"Algenib", "Gravelly"}, {"Rasalgethi", "Informative"}, {"Laomedeia", "Upbeat"}, {"Achernar", "Soft"},
	{"Alnilam", "Firm"}, {"Schedar", "Even"}, {"Gacrux", "Mature"}, {"Pulcherrima", "Forward"}, {"Achird", "Friendly"},
	{"Zubenelgenubi", "Casual"}, {"Vindemiatrix", "Gentle"}, {"Sadachbia", "Lively"}, {"Sadaltager", "Knowledgeable"}, {"Sulafat", "Warm"},
}

var interviewVoices = func() map[string]bool {
	m := map[string]bool{}
	for _, v := range interviewVoiceList {
		m[v.Name] = true
	}
	return m
}()

const (
	ttsModel         = "gemini-3.8-flash-tts"
	ttsSampleRate    = 24000
	voicePreviewLine = "Hi, thanks for joining today. I'm looking forward to hearing about your experience. To start, could you tell me a little about yourself?"
)

// synthesizeSpeech returns WAV audio of text spoken in a prebuilt voice.
func synthesizeSpeech(ctx context.Context, key, voice, text string) ([]byte, error) {
	body := map[string]any{
		"contents": []any{map[string]any{"role": "user", "parts": []geminiPart{{Text: text}}}},
		"generationConfig": map[string]any{
			"responseModalities": []string{"AUDIO"},
			"speechConfig":       map[string]any{"voiceConfig": map[string]any{"prebuiltVoiceConfig": map[string]any{"voiceName": voice}}},
		},
	}
	var resp struct {
		Candidates []struct {
			Content struct {
				Parts []struct {
					InlineData *geminiBlob `json:"inlineData"`
				} `json:"parts"`
			} `json:"content"`
		} `json:"candidates"`
	}
	if err := geminiPost(ctx, key, "/v1beta/models/"+url.PathEscape(ttsModel)+":generateContent", body, &resp); err != nil {
		return nil, err
	}
	for _, c := range resp.Candidates {
		for _, p := range c.Content.Parts {
			if p.InlineData == nil {
				continue
			}
			audio, err := base64.StdEncoding.DecodeString(p.InlineData.Data)
			if err != nil {
				return nil, errors.New("Gemini returned unreadable audio")
			}
			if bytes.HasPrefix(audio, []byte("RIFF")) || strings.Contains(p.InlineData.MimeType, "wav") {
				return audio, nil
			}
			return pcmToWAV(audio, ttsSampleRate), nil // raw 16-bit mono PCM (audio/L16)
		}
	}
	return nil, errors.New("Gemini returned no audio")
}

// pcmToWAV adds a RIFF header to 16-bit little-endian mono PCM.
func pcmToWAV(pcm []byte, rate int) []byte {
	var b bytes.Buffer
	w := func(v any) { _ = binary.Write(&b, binary.LittleEndian, v) }
	b.WriteString("RIFF")
	w(uint32(36 + len(pcm)))
	b.WriteString("WAVEfmt ")
	w(uint32(16))
	w(uint16(1)) // PCM
	w(uint16(1)) // mono
	w(uint32(rate))
	w(uint32(rate * 2)) // byte rate
	w(uint16(2))        // block align
	w(uint16(16))       // bits per sample
	b.WriteString("data")
	w(uint32(len(pcm)))
	b.Write(pcm)
	return b.Bytes()
}

// voicePreview returns a short sample of a voice, generated once and cached in dir.
func voicePreview(ctx context.Context, s Settings, dir, voice string) ([]byte, error) {
	if !interviewVoices[voice] {
		return nil, fmt.Errorf("unknown voice %q", voice)
	}
	path := filepath.Join(dir, voice+".wav")
	if cached, err := os.ReadFile(path); err == nil && len(cached) > 44 {
		return cached, nil
	}
	if s.GeminiKey == "" {
		return nil, errNoGeminiKey
	}
	wav, err := synthesizeSpeech(ctx, s.GeminiKey, voice, voicePreviewLine)
	if err != nil {
		return nil, err
	}
	if err := os.MkdirAll(dir, 0o755); err == nil {
		_ = os.WriteFile(path, wav, 0o644) // caching is best-effort
	}
	return wav, nil
}
