package main

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/binary"
	"encoding/json"
	"errors"
	"fmt"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/gorilla/websocket"
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

// geminiLiveWSBase is the Live API host (a var so tests can use a fake server).
var geminiLiveWSBase = "wss://generativelanguage.googleapis.com"

const (
	liveWSPath       = "/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent"
	liveSampleRate   = 24000
	voiceSampleLimit = 45 * time.Second
	voicePreviewLine = "Hi, thanks for joining today. I'm looking forward to hearing about your experience. To start, could you tell me a little about yourself?"
)

// liveVoiceSample has the Live model (the same one that runs interviews) speak
// one line in the given voice, and returns it as WAV. Runs in the backend, so
// the API key never reaches the page.
func liveVoiceSample(ctx context.Context, key, model, voice, text string) ([]byte, error) {
	if key == "" {
		return nil, errNoGeminiKey
	}
	ctx, cancel := context.WithTimeout(ctx, voiceSampleLimit)
	defer cancel()
	hide := func(err error) string { return strings.ReplaceAll(err.Error(), key, "[key]") }

	conn, _, err := websocket.DefaultDialer.DialContext(ctx, geminiLiveWSBase+liveWSPath+"?key="+url.QueryEscape(key), nil)
	if err != nil {
		return nil, fmt.Errorf("could not reach Gemini Live: %s", hide(err))
	}
	defer conn.Close()
	if dl, ok := ctx.Deadline(); ok {
		_ = conn.SetReadDeadline(dl)
		_ = conn.SetWriteDeadline(dl)
	}

	setup := map[string]any{"setup": map[string]any{
		"model": "models/" + model,
		"generationConfig": map[string]any{
			"responseModalities": []string{"AUDIO"},
			"speechConfig":       map[string]any{"voiceConfig": map[string]any{"prebuiltVoiceConfig": map[string]any{"voiceName": voice}}},
		},
		"systemInstruction": map[string]any{"parts": []map[string]any{{"text": "You are recording a voice sample for an interview app. " +
			"When given a line, say exactly that line in a natural, friendly, professional interviewer tone. Say nothing else."}}},
	}}
	if err := conn.WriteJSON(setup); err != nil {
		return nil, fmt.Errorf("Gemini Live: %s", hide(err))
	}

	var pcm []byte
	for {
		_, raw, err := conn.ReadMessage()
		if err != nil {
			var ce *websocket.CloseError
			if errors.As(err, &ce) && ce.Text != "" {
				return nil, fmt.Errorf("Gemini Live closed the session: %s", strings.ReplaceAll(ce.Text, key, "[key]"))
			}
			if errors.Is(ctx.Err(), context.DeadlineExceeded) {
				return nil, errors.New("Gemini Live took too long to answer")
			}
			return nil, fmt.Errorf("Gemini Live: %s", hide(err))
		}
		var msg struct {
			SetupComplete *struct{} `json:"setupComplete"`
			ServerContent *struct {
				ModelTurn *struct {
					Parts []struct {
						InlineData *geminiBlob `json:"inlineData"`
					} `json:"parts"`
				} `json:"modelTurn"`
				TurnComplete bool `json:"turnComplete"`
			} `json:"serverContent"`
		}
		if json.Unmarshal(raw, &msg) != nil {
			continue
		}
		if msg.SetupComplete != nil {
			turn := map[string]any{"clientContent": map[string]any{
				"turns":        []any{map[string]any{"role": "user", "parts": []map[string]any{{"text": "Say exactly: " + text}}}},
				"turnComplete": true,
			}}
			if err := conn.WriteJSON(turn); err != nil {
				return nil, fmt.Errorf("Gemini Live: %s", hide(err))
			}
			continue
		}
		if sc := msg.ServerContent; sc != nil {
			if sc.ModelTurn != nil {
				for _, p := range sc.ModelTurn.Parts {
					if p.InlineData == nil || !strings.HasPrefix(p.InlineData.MimeType, "audio/") {
						continue
					}
					chunk, err := base64.StdEncoding.DecodeString(p.InlineData.Data)
					if err == nil {
						pcm = append(pcm, chunk...)
					}
				}
			}
			if sc.TurnComplete {
				break
			}
		}
	}
	_ = conn.WriteMessage(websocket.CloseMessage, websocket.FormatCloseMessage(websocket.CloseNormalClosure, "done"))
	if len(pcm) == 0 {
		return nil, errors.New("Gemini Live returned no audio")
	}
	return pcmToWAV(pcm, liveSampleRate), nil
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

// voicePreview returns a short sample of a voice from the Live model, generated once and cached in dir.
func voicePreview(ctx context.Context, s Settings, dir, voice string) ([]byte, error) {
	if !interviewVoices[voice] {
		return nil, fmt.Errorf("unknown voice %q", voice)
	}
	// "-live" marks samples recorded with the Live model (older TTS samples are ignored).
	path := filepath.Join(dir, voice+"-live.wav")
	if cached, err := os.ReadFile(path); err == nil && len(cached) > 44 {
		return cached, nil
	}
	wav, err := liveVoiceSample(ctx, s.GeminiKey, s.GeminiLiveModel, voice, voicePreviewLine)
	if err != nil {
		return nil, err
	}
	if err := os.MkdirAll(dir, 0o755); err == nil {
		_ = os.WriteFile(path, wav, 0o644) // caching is best-effort
	}
	return wav, nil
}
