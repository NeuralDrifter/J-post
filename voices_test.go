// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

package main

import (
	"bytes"
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"jobtrack/internal/gemini/geminitest"
	"jobtrack/internal/settings"
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

func TestVoicePreviewIsCached(t *testing.T) {
	calls, voice := 0, ""
	geminitest.FakeLiveAudio(t, [][]byte{{1, 0, 2, 0}}, &calls, &voice)
	dir := t.TempDir()
	s := settings.Settings{GeminiKey: "k3y", GeminiLiveModel: "gemini-3.8-live"}
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
	if _, err := voicePreview(context.Background(), settings.Settings{}, t.TempDir(), "Kore"); err == nil {
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
