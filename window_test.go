// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

package main

import (
	"testing"

	"jobtrack/internal/settings"
)

func TestPlanWindow(t *testing.T) {
	cases := []struct {
		name  string
		w, h  int
		saved settings.WindowState
		want  windowPlan
	}{
		{"1080p", 1920, 1080, settings.WindowState{}, windowPlan{1600, 918, 900, 600, false}},
		{"1440p capped", 2560, 1440, settings.WindowState{}, windowPlan{1600, 1000, 900, 600, false}},
		{"small laptop", 1366, 768, settings.WindowState{}, windowPlan{1161, 652, 900, 600, false}},
		{"720p logical", 1280, 720, settings.WindowState{}, windowPlan{1088, 612, 900, 600, true}},
		{"tiny screen", 800, 600, settings.WindowState{}, windowPlan{800, 600, 800, 600, true}},
		{"saved fits", 1920, 1080, settings.WindowState{Width: 1400, Height: 900, Maximised: true}, windowPlan{1400, 900, 900, 600, true}},
		{"saved too big", 1366, 768, settings.WindowState{Width: 2400, Height: 1300}, windowPlan{1161, 652, 900, 600, false}},
		{"saved below min", 1920, 1080, settings.WindowState{Width: 500, Height: 400}, windowPlan{900, 600, 900, 600, false}},
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
