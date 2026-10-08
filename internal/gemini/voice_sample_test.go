// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

package gemini

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/binary"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gorilla/websocket"
)

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
	wav, err := LiveVoiceSample(context.Background(), "k3y", "gemini-3.8-live", "Sulafat", "Hello")
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
	_, err := LiveVoiceSample(context.Background(), "s3cretkey", "m", "Kore", "Hi")
	if err == nil || strings.Contains(err.Error(), "s3cretkey") {
		t.Fatalf("err = %v", err)
	}
}
