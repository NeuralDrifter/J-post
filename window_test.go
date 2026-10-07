package main

import (
	"os"
	"path/filepath"
	"testing"
)

func TestPlanWindow(t *testing.T) {
	cases := []struct {
		name  string
		w, h  int
		saved WindowState
		want  windowPlan
	}{
		{"1080p", 1920, 1080, WindowState{}, windowPlan{1600, 918, 900, 600, false}},
		{"1440p capped", 2560, 1440, WindowState{}, windowPlan{1600, 1000, 900, 600, false}},
		{"small laptop", 1366, 768, WindowState{}, windowPlan{1161, 652, 900, 600, false}},
		{"720p logical", 1280, 720, WindowState{}, windowPlan{1088, 612, 900, 600, true}},
		{"tiny screen", 800, 600, WindowState{}, windowPlan{800, 600, 800, 600, true}},
		{"saved fits", 1920, 1080, WindowState{Width: 1400, Height: 900, Maximised: true}, windowPlan{1400, 900, 900, 600, true}},
		{"saved too big", 1366, 768, WindowState{Width: 2400, Height: 1300}, windowPlan{1161, 652, 900, 600, false}},
		{"saved below min", 1920, 1080, WindowState{Width: 500, Height: 400}, windowPlan{900, 600, 900, 600, false}},
	}
	for _, c := range cases {
		if got := planWindow(c.w, c.h, c.saved); got != c.want {
			t.Errorf("%s: got %+v, want %+v", c.name, got, c.want)
		}
	}
}

func TestPickScreen(t *testing.T) {
	primary := screenSize{W: 1920, H: 1080, primary: true}
	current := screenSize{W: 1366, H: 768, current: true}
	if got, ok := pickScreen([]screenSize{primary, current}); !ok || got != current {
		t.Errorf("want current, got %+v", got)
	}
	if got, ok := pickScreen([]screenSize{{W: 1280, H: 1024}, primary}); !ok || got != primary {
		t.Errorf("want primary, got %+v", got)
	}
	if got, ok := pickScreen([]screenSize{{}, {W: 1280, H: 1024}}); !ok || got.W != 1280 {
		t.Errorf("want first non-empty, got %+v", got)
	}
	if _, ok := pickScreen(nil); ok {
		t.Error("empty list should not pick")
	}
}

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
