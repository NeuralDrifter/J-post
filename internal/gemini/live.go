// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

package gemini

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/url"
	"strings"
	"time"

	"github.com/gorilla/websocket"
)

// Short Gemini Live sessions run by the backend (the API key stays in Go):
// voice previews, coaching tips and scorecards. Everything uses the Live model,
// the same one that runs the interview. That model can only reply with audio,
// so structured results come back as the arguments of a tool call instead.

// geminiLiveWSBase is the Live API host (a var so tests can use a fake server).
var geminiLiveWSBase = "wss://generativelanguage.googleapis.com"

const liveWSPath = "/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent"

// liveBaseSetup is what every Live session needs: the model, audio replies and
// the system instruction.
func liveBaseSetup(model, instruction string) map[string]any {
	return map[string]any{
		"model":             "models/" + model,
		"generationConfig":  map[string]any{"responseModalities": []string{"AUDIO"}},
		"systemInstruction": map[string]any{"parts": []map[string]any{{"text": instruction}}},
	}
}

// LiveVoiceSetup adds the prebuilt voice the model speaks with.
func LiveVoiceSetup(model, voice, instruction string) map[string]any {
	setup := liveBaseSetup(model, instruction)
	setup["generationConfig"].(map[string]any)["speechConfig"] = map[string]any{
		"voiceConfig": map[string]any{"prebuiltVoiceConfig": map[string]any{"voiceName": voice}},
	}
	return setup
}

// liveMessage is the part of a Live server message these sessions read.
type liveMessage struct {
	SetupComplete *struct{} `json:"setupComplete"`
	ServerContent *struct {
		ModelTurn *struct {
			Parts []struct {
				InlineData *Blob `json:"inlineData"`
			} `json:"parts"`
		} `json:"modelTurn"`
		TurnComplete bool `json:"turnComplete"`
	} `json:"serverContent"`
	ToolCall *struct {
		FunctionCalls []struct {
			Name string          `json:"name"`
			Args json.RawMessage `json:"args"`
		} `json:"functionCalls"`
	} `json:"toolCall"`
}

// liveSession is one backend-side Live connection. Its errors never contain the
// API key, which travels in the URL.
type liveSession struct {
	ctx  context.Context
	conn *websocket.Conn
	key  string
}

// openLiveSession connects and sends the setup; the session ends when ctx does.
func openLiveSession(ctx context.Context, key string, setup map[string]any) (*liveSession, error) {
	conn, _, err := websocket.DefaultDialer.DialContext(ctx, geminiLiveWSBase+liveWSPath+"?key="+url.QueryEscape(key), nil)
	if err != nil {
		return nil, fmt.Errorf("could not reach Gemini Live: %s", HideKey(err.Error(), key))
	}
	s := &liveSession{ctx: ctx, conn: conn, key: key}
	if dl, ok := ctx.Deadline(); ok {
		_ = conn.SetReadDeadline(dl)
		_ = conn.SetWriteDeadline(dl)
	}
	if err := conn.WriteJSON(map[string]any{"setup": setup}); err != nil {
		conn.Close()
		return nil, s.wrap(err)
	}
	return s, nil
}

// sendTurn sends one complete user turn.
func (s *liveSession) sendTurn(parts []Part) error {
	turn := map[string]any{"clientContent": map[string]any{
		"turns":        []any{map[string]any{"role": "user", "parts": parts}},
		"turnComplete": true,
	}}
	return s.wrap(s.conn.WriteJSON(turn))
}

// next reads the next server message, skipping frames it can't parse.
func (s *liveSession) next() (liveMessage, error) {
	for {
		_, raw, err := s.conn.ReadMessage()
		if err != nil {
			return liveMessage{}, s.wrap(err)
		}
		var msg liveMessage
		if json.Unmarshal(raw, &msg) == nil {
			return msg, nil
		}
	}
}

func (s *liveSession) close() {
	_ = s.conn.WriteMessage(websocket.CloseMessage, websocket.FormatCloseMessage(websocket.CloseNormalClosure, "done"))
	s.conn.Close()
}

// wrap turns a connection error into a readable message without the key.
func (s *liveSession) wrap(err error) error {
	if err == nil {
		return nil
	}
	var ce *websocket.CloseError
	if errors.As(err, &ce) && ce.Text != "" {
		return fmt.Errorf("Gemini Live closed the session: %s", HideKey(ce.Text, s.key))
	}
	if errors.Is(s.ctx.Err(), context.DeadlineExceeded) {
		return errors.New("Gemini Live took too long to answer")
	}
	return fmt.Errorf("Gemini Live: %s", HideKey(err.Error(), s.key))
}

func HideKey(text, key string) string { return strings.ReplaceAll(text, key, "[key]") }

// JSONPrompt asks the Live model for a structured result.
type JSONPrompt struct {
	Model  string
	System string
	Parts  []Part
	Schema map[string]any // the result's shape, declared as the tool's parameters
}

const (
	LiveResultTool  = "submit_result"
	liveResultLimit = 90 * time.Second
)

// LiveStructured runs a one-turn Live session in which the model returns its
// answer by calling submit_result, and decodes the call's arguments into out.
// Tested against gemini-3.8-live: a full scorecard arrives in a few seconds with
// no speech, where asking it to speak the JSON took about a minute and came back cut off.
func LiveStructured(ctx context.Context, key string, p JSONPrompt, out any) error {
	if key == "" {
		return ErrNoKey
	}
	ctx, cancel := context.WithTimeout(ctx, liveResultLimit)
	defer cancel()
	setup := liveBaseSetup(p.Model, p.System+" Deliver your answer only by calling "+LiveResultTool+" once. Do not speak.")
	setup["tools"] = []any{map[string]any{"functionDeclarations": []any{map[string]any{
		"name":        LiveResultTool,
		"description": "Submit the finished result.",
		"parameters":  p.Schema,
	}}}}
	s, err := openLiveSession(ctx, key, setup)
	if err != nil {
		return err
	}
	defer s.close()
	for {
		msg, err := s.next()
		if err != nil {
			return err
		}
		switch {
		case msg.SetupComplete != nil:
			if err := s.sendTurn(p.Parts); err != nil {
				return err
			}
		case msg.ToolCall != nil:
			for _, call := range msg.ToolCall.FunctionCalls {
				if call.Name != LiveResultTool {
					continue
				}
				if err := json.Unmarshal(call.Args, out); err != nil {
					return fmt.Errorf("Gemini Live's answer wasn't in the expected format: %v", err)
				}
				return nil
			}
		case msg.ServerContent != nil && msg.ServerContent.TurnComplete:
			return errors.New("Gemini Live finished without returning a result; try again")
		}
	}
}
