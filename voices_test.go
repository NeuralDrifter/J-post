package main

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/binary"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/gorilla/websocket"
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

// fakeLive is a minimal Live API server: setup → setupComplete, text turn → audio chunks → turnComplete.
func fakeLive(t *testing.T, chunks [][]byte, calls *int, sawVoice *string) {
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
	old := geminiLiveWSBase
	geminiLiveWSBase = "ws" + strings.TrimPrefix(srv.URL, "http")
	t.Cleanup(func() { geminiLiveWSBase = old })
}

func TestLiveVoiceSample(t *testing.T) {
	calls, voice := 0, ""
	fakeLive(t, [][]byte{{1, 0, 2, 0}, {3, 0, 4, 0}}, &calls, &voice)
	wav, err := liveVoiceSample(context.Background(), "k3y", "gemini-3.8-live", "Sulafat", "Hello")
	if err != nil {
		t.Fatal(err)
	}
	if voice != "Sulafat" || !bytes.HasPrefix(wav, []byte("RIFF")) || binary.LittleEndian.Uint32(wav[24:28]) != 24000 ||
		!bytes.HasSuffix(wav, []byte{1, 0, 2, 0, 3, 0, 4, 0}) {
		t.Fatalf("voice=%s wav=% x", voice, wav)
	}
}

func TestLiveVoiceSampleErrorsHideKey(t *testing.T) {
	old := geminiLiveWSBase
	geminiLiveWSBase = "ws://127.0.0.1:1"
	t.Cleanup(func() { geminiLiveWSBase = old })
	_, err := liveVoiceSample(context.Background(), "s3cretkey", "m", "Kore", "Hi")
	if err == nil || strings.Contains(err.Error(), "s3cretkey") {
		t.Fatalf("err = %v", err)
	}
}

func TestVoicePreviewIsCached(t *testing.T) {
	calls, voice := 0, ""
	fakeLive(t, [][]byte{{1, 0, 2, 0}}, &calls, &voice)
	dir := t.TempDir()
	s := Settings{GeminiKey: "k3y", GeminiLiveModel: "gemini-3.8-live"}
	first, err := voicePreview(context.Background(), s, dir, "Sulafat")
	if err != nil || !bytes.HasPrefix(first, []byte("RIFF")) {
		t.Fatalf("first = %d bytes, %v", len(first), err)
	}
	if _, err := os.Stat(filepath.Join(dir, "Sulafat-live.wav")); err != nil {
		t.Fatal("preview should be saved to disk")
	}
	second, _ := voicePreview(context.Background(), s, dir, "Sulafat")
	if calls != 1 || !bytes.Equal(second, first) {
		t.Fatalf("second preview should come from disk: calls=%d", calls)
	}
	if _, err := voicePreview(context.Background(), s, dir, "../../etc"); err == nil {
		t.Fatal("unknown voice names must be rejected (also guards the file path)")
	}
	if _, err := voicePreview(context.Background(), Settings{}, t.TempDir(), "Kore"); err == nil {
		t.Fatal("no key and no cached preview should error")
	}
}

func TestVoiceGenders(t *testing.T) {
	female, male := 0, 0
	for _, v := range interviewVoiceList {
		switch v.Gender {
		case "female":
			female++
		case "male":
			male++
		default:
			t.Errorf("%s has no gender", v.Name)
		}
	}
	if female != 14 || male != 16 || voiceGender["Kore"] != "female" || voiceGender["Charon"] != "male" {
		t.Fatalf("female=%d male=%d", female, male)
	}
}

func TestRandomInterviewerByDefault(t *testing.T) {
	seenVoices := map[string]bool{}
	for i := 0; i < 40; i++ {
		s := InterviewSetup{Kind: "behavioral", Minutes: 10, Persona: "neutral"}
		if err := validateInterviewSetup(&s); err != nil {
			t.Fatal(err)
		}
		if !interviewVoices[s.Voice] || s.InterviewerName == "" {
			t.Fatalf("setup = %+v", s)
		}
		first := strings.Fields(s.InterviewerName)[0]
		if !nameMatches(first, voiceGender[s.Voice]) {
			t.Fatalf("%q doesn't match %s voice %s", s.InterviewerName, voiceGender[s.Voice], s.Voice)
		}
		seenVoices[s.Voice] = true
	}
	if len(seenVoices) < 5 {
		t.Fatalf("voices should vary, saw only %v", seenVoices)
	}
}

func TestChosenVoiceAndName(t *testing.T) {
	s := InterviewSetup{Kind: "behavioral", Minutes: 10, Persona: "neutral", Voice: "Charon"}
	validateInterviewSetup(&s)
	if s.Voice != "Charon" || !nameMatches(strings.Fields(s.InterviewerName)[0], "male") {
		t.Fatalf("a chosen voice keeps a gender-matched random name: %+v", s)
	}
	s = InterviewSetup{Kind: "behavioral", Minutes: 10, Persona: "neutral", Voice: "Kore", InterviewerName: "  Pat Lee "}
	validateInterviewSetup(&s)
	if s.InterviewerName != "Pat Lee" {
		t.Fatalf("a typed name is kept: %+v", s)
	}
}

func nameMatches(first, gender string) bool {
	list := maleFirstNames
	if gender == "female" {
		list = femaleFirstNames
	}
	for _, n := range list {
		if n == first {
			return true
		}
	}
	return false
}
