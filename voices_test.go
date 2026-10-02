package main

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/binary"
	"encoding/json"
	"net/http"
	"os"
	"path/filepath"
	"testing"
)

func TestVoicesCatalog(t *testing.T) {
	if len(interviewVoiceList) != 30 {
		t.Fatalf("want Google's 30 prebuilt voices, got %d", len(interviewVoiceList))
	}
	for _, v := range []string{"Zephyr", "Kore", "Sulafat", "Zubenelgenubi"} {
		s := InterviewSetup{Kind: "behavioral", Minutes: 10, Persona: "neutral", Voice: v}
		if err := validateInterviewSetup(&s); err != nil {
			t.Errorf("%s should be valid: %v", v, err)
		}
	}
}

func ttsServer(t *testing.T, mime string, audio []byte, calls *int) {
	withGeminiServer(t, func(w http.ResponseWriter, r *http.Request) {
		*calls++
		var body map[string]any
		json.NewDecoder(r.Body).Decode(&body)
		voice := body["generationConfig"].(map[string]any)["speechConfig"].(map[string]any)["voiceConfig"].(map[string]any)["prebuiltVoiceConfig"].(map[string]any)["voiceName"]
		if r.URL.Path != "/v1beta/models/gemini-3.8-flash-tts:generateContent" || voice != "Sulafat" {
			t.Errorf("path=%s voice=%v", r.URL.Path, voice)
		}
		resp, _ := json.Marshal(map[string]any{"candidates": []any{map[string]any{"content": map[string]any{"parts": []any{
			map[string]any{"inlineData": map[string]any{"mimeType": mime, "data": base64.StdEncoding.EncodeToString(audio)}},
		}}}}})
		w.Write(resp)
	})
}

func TestSynthesizeSpeechWrapsRawPCM(t *testing.T) {
	calls := 0
	pcm := []byte{1, 0, 2, 0, 3, 0, 4, 0}
	ttsServer(t, "audio/L16;codec=pcm;rate=24000", pcm, &calls)
	wav, err := synthesizeSpeech(context.Background(), "k", "Sulafat", "Hello")
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.HasPrefix(wav, []byte("RIFF")) || string(wav[8:12]) != "WAVE" || binary.LittleEndian.Uint32(wav[24:28]) != 24000 || !bytes.HasSuffix(wav, pcm) {
		t.Fatalf("not a 24 kHz WAV wrapping the PCM: % x", wav[:44])
	}
}

func TestVoicePreviewIsCached(t *testing.T) {
	calls := 0
	wav := append([]byte("RIFF\x00\x00\x00\x00WAVE"), make([]byte, 40)...)
	ttsServer(t, "audio/wav", wav, &calls)
	dir := t.TempDir()
	s := Settings{GeminiKey: "k"}
	first, err := voicePreview(context.Background(), s, dir, "Sulafat")
	if err != nil || !bytes.Equal(first, wav) {
		t.Fatalf("first = %d bytes, %v", len(first), err)
	}
	if _, err := os.Stat(filepath.Join(dir, "Sulafat.wav")); err != nil {
		t.Fatal("preview should be saved to disk")
	}
	second, _ := voicePreview(context.Background(), s, dir, "Sulafat")
	if calls != 1 || !bytes.Equal(second, wav) {
		t.Fatalf("second preview should come from disk: calls=%d", calls)
	}
	if _, err := voicePreview(context.Background(), s, dir, "../../etc"); err == nil {
		t.Fatal("unknown voice names must be rejected (also guards the file path)")
	}
	if _, err := voicePreview(context.Background(), Settings{}, t.TempDir(), "Kore"); err == nil {
		t.Fatal("no key and no cached preview should error")
	}
}
