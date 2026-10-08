// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

package settings

import (
	"os"
	"path/filepath"
	"testing"
)

func TestWindowStateRoundTrip(t *testing.T) {
	store := NewWindowStateStore(t.TempDir())
	if got, err := store.Load(); err != nil || got != (WindowState{}) {
		t.Fatalf("fresh = %+v, %v", got, err)
	}
	want := WindowState{Width: 1400, Height: 900, Maximised: true}
	if err := store.Save(want); err != nil {
		t.Fatal(err)
	}
	if got, err := store.Load(); err != nil || got != want {
		t.Fatalf("got %+v, %v", got, err)
	}
}

func TestWindowStateReadsLegacySettingsFields(t *testing.T) {
	dir := t.TempDir()
	legacy := `{"followUpDays": 7, "windowWidth": 1300, "windowHeight": 850, "windowMaximised": true}`
	if err := os.WriteFile(filepath.Join(dir, "settings.json"), []byte(legacy), 0o600); err != nil {
		t.Fatal(err)
	}
	got, err := NewWindowStateStore(dir).Load()
	if err != nil || got != (WindowState{Width: 1300, Height: 850, Maximised: true}) {
		t.Fatalf("got %+v, %v", got, err)
	}
}
