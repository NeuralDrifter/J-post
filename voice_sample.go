// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

package main

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/binary"
	"errors"
	"strings"
	"time"
)

const (
	liveSampleRate   = 24000
	voiceSampleLimit = 45 * time.Second
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
	s, err := openLiveSession(ctx, key, liveVoiceSetup(model, voice, "You are recording a voice sample for an interview app. "+
		"When given a line, say exactly that line in a natural, friendly, professional interviewer tone. Say nothing else."))
	if err != nil {
		return nil, err
	}
	defer s.close()

	var pcm []byte
	for {
		msg, err := s.next()
		if err != nil {
			return nil, err
		}
		if msg.SetupComplete != nil {
			if err := s.sendTurn([]geminiPart{{Text: "Say exactly: " + text}}); err != nil {
				return nil, err
			}
			continue
		}
		sc := msg.ServerContent
		if sc == nil {
			continue
		}
		if sc.ModelTurn != nil {
			for _, p := range sc.ModelTurn.Parts {
				if p.InlineData == nil || !strings.HasPrefix(p.InlineData.MimeType, "audio/") {
					continue
				}
				if chunk, err := base64.StdEncoding.DecodeString(p.InlineData.Data); err == nil {
					pcm = append(pcm, chunk...)
				}
			}
		}
		if sc.TurnComplete {
			break
		}
	}
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
