// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

package main

import (
	"context"
	"fmt"
	"math/rand/v2"
	"os"
	"path/filepath"

	"jobtrack/internal/gemini"
	"jobtrack/internal/settings"
)

// VoiceOption is one of Google's prebuilt voices (usable by Live and TTS models).
type VoiceOption struct {
	Name   string `json:"name"`
	Style  string `json:"style"`
	Gender string `json:"gender"` // female | male
}

// interviewVoiceList is Google's prebuilt voice catalog: names and styles from the
// Gemini speech-generation docs, genders from the Cloud TTS "Chirp 3 HD" catalog
// (the same 30 voices).
var interviewVoiceList = []VoiceOption{
	{"Zephyr", "Bright", "female"}, {"Puck", "Upbeat", "male"}, {"Charon", "Informative", "male"}, {"Kore", "Firm", "female"}, {"Fenrir", "Excitable", "male"},
	{"Leda", "Youthful", "female"}, {"Orus", "Firm", "male"}, {"Aoede", "Breezy", "female"}, {"Callirrhoe", "Easy-going", "female"}, {"Autonoe", "Bright", "female"},
	{"Enceladus", "Breathy", "male"}, {"Iapetus", "Clear", "male"}, {"Umbriel", "Easy-going", "male"}, {"Algieba", "Smooth", "male"}, {"Despina", "Smooth", "female"},
	{"Erinome", "Clear", "female"}, {"Algenib", "Gravelly", "male"}, {"Rasalgethi", "Informative", "male"}, {"Laomedeia", "Upbeat", "female"}, {"Achernar", "Soft", "female"},
	{"Alnilam", "Firm", "male"}, {"Schedar", "Even", "male"}, {"Gacrux", "Mature", "female"}, {"Pulcherrima", "Forward", "female"}, {"Achird", "Friendly", "male"},
	{"Zubenelgenubi", "Casual", "male"}, {"Vindemiatrix", "Gentle", "female"}, {"Sadachbia", "Lively", "male"}, {"Sadaltager", "Knowledgeable", "male"}, {"Sulafat", "Warm", "female"},
}

var (
	interviewVoices = map[string]bool{}
	voiceGender     = map[string]string{}
)

func init() {
	for _, v := range interviewVoiceList {
		interviewVoices[v.Name] = true
		voiceGender[v.Name] = v.Gender
	}
}

// Names for the interviewer, matched to the voice's gender.
var (
	femaleFirstNames = []string{"Maya", "Priya", "Elena", "Grace", "Aisha", "Sofia", "Hannah", "Mei", "Olivia", "Camila",
		"Nadia", "Rachel", "Laura", "Fatima", "Chloe", "Ingrid", "Yuki", "Amara", "Julia", "Teresa"}
	maleFirstNames = []string{"Daniel", "Marcus", "Ravi", "Tomas", "James", "Kenji", "Omar", "Lucas", "Ethan", "Andre",
		"Samuel", "Victor", "Hiro", "David", "Mateo", "Noah", "Kwame", "Felix", "Arjun", "Peter"}
	lastNames = []string{"Chen", "Patel", "Garcia", "Okafor", "Nguyen", "Kowalski", "Hughes", "Rossi", "Kim", "Silva",
		"Bennett", "Haddad", "Larsen", "Moreno", "Tanaka", "Brooks", "Ibrahim", "Fischer", "Walsh", "Ortiz"}
)

func pick[T any](list []T) T { return list[rand.IntN(len(list))] }

// randomInterviewerName returns a full name matching the voice's gender.
func randomInterviewerName(voice string) string {
	first := maleFirstNames
	if voiceGender[voice] == "female" {
		first = femaleFirstNames
	}
	return pick(first) + " " + pick(lastNames)
}

const voicePreviewLine = "Hi, thanks for joining today. I'm looking forward to hearing about your experience. To start, could you tell me a little about yourself?"

// voicePreview returns a short sample of a voice from the Live model, generated once and cached in dir.
func voicePreview(ctx context.Context, s settings.Settings, dir, voice string) ([]byte, error) {
	if !interviewVoices[voice] {
		return nil, fmt.Errorf("unknown voice %q", voice)
	}
	// "-live" marks samples recorded with the Live model (older TTS samples are ignored).
	path := filepath.Join(dir, voice+"-live.wav")
	if cached, err := os.ReadFile(path); err == nil && len(cached) > 44 {
		return cached, nil
	}
	wav, err := gemini.LiveVoiceSample(ctx, s.GeminiKey, s.GeminiLiveModel, voice, voicePreviewLine)
	if err != nil {
		return nil, err
	}
	if err := os.MkdirAll(dir, 0o755); err == nil {
		_ = os.WriteFile(path, wav, 0o644) // caching is best-effort
	}
	return wav, nil
}
