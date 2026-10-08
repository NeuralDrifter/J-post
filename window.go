// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

package main

import (
	"context"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"sync"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

const (
	minWindowWidth    = 900
	minWindowHeight   = 600
	maxStartWidth     = 1600
	maxStartHeight    = 1000
	smallScreenWidth  = 1280
	smallScreenHeight = 720
	startScreenPct    = 85 // a fresh window fills this % of the screen in each direction
)

// WindowState is the main window's size at the end of the last session. Only
// the app writes it, so it lives apart from the user's Settings.
type WindowState struct {
	Width     int  `json:"width"`
	Height    int  `json:"height"`
	Maximised bool `json:"maximised"`
}

type WindowStateStore struct {
	mu         sync.Mutex
	filePath   string
	legacyPath string // settings.json, which held these fields before window.json existed
}

func NewWindowStateStore(dir string) *WindowStateStore {
	return &WindowStateStore{filePath: filepath.Join(dir, "window.json"), legacyPath: filepath.Join(dir, "settings.json")}
}

// Load returns the saved state, the old copy inside settings.json if there's no
// window.json yet, or the zero state (meaning "pick a size for this screen").
func (s *WindowStateStore) Load() (WindowState, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	var w WindowState
	data, err := os.ReadFile(s.filePath)
	if errors.Is(err, os.ErrNotExist) {
		return s.loadLegacy()
	}
	if err != nil {
		return w, err
	}
	return w, json.Unmarshal(data, &w)
}

func (s *WindowStateStore) loadLegacy() (WindowState, error) {
	var legacy struct {
		Width     int  `json:"windowWidth"`
		Height    int  `json:"windowHeight"`
		Maximised bool `json:"windowMaximised"`
	}
	data, err := os.ReadFile(s.legacyPath)
	if errors.Is(err, os.ErrNotExist) {
		return WindowState{}, nil
	}
	if err != nil {
		return WindowState{}, err
	}
	if err := json.Unmarshal(data, &legacy); err != nil {
		return WindowState{}, err
	}
	return WindowState{Width: legacy.Width, Height: legacy.Height, Maximised: legacy.Maximised}, nil
}

func (s *WindowStateStore) Save(w WindowState) error {
	data, err := json.MarshalIndent(w, "", "  ")
	if err != nil {
		return err
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	return writeFileAtomic(s.filePath, data, 0o644)
}

// windowPlan is the startup geometry for the main window, in logical pixels.
type windowPlan struct {
	Width, Height       int
	MinWidth, MinHeight int
	Maximise            bool
}

// screenSize is a monitor's logical size (after display scaling).
type screenSize struct {
	W, H             int
	current, primary bool
}

// planWindow picks a window size that always fits the given screen: the saved
// size if it still fits, otherwise startScreenPct of the screen; small screens start maximised.
func planWindow(screenW, screenH int, saved WindowState) windowPlan {
	p := windowPlan{MinWidth: min(minWindowWidth, screenW), MinHeight: min(minWindowHeight, screenH)}
	if saved.Width > 0 && saved.Height > 0 && saved.Width <= screenW && saved.Height <= screenH {
		p.Width = max(saved.Width, p.MinWidth)
		p.Height = max(saved.Height, p.MinHeight)
		p.Maximise = saved.Maximised
		return p
	}
	p.Width = clamp(screenW*startScreenPct/100, p.MinWidth, maxStartWidth)
	p.Height = clamp(screenH*startScreenPct/100, p.MinHeight, maxStartHeight)
	p.Maximise = screenW <= smallScreenWidth || screenH <= smallScreenHeight
	return p
}

// pickScreen prefers the monitor the window is on, then the primary one.
func pickScreen(screens []screenSize) (screenSize, bool) {
	var primary, first *screenSize
	for i := range screens {
		s := &screens[i]
		if s.W <= 0 || s.H <= 0 {
			continue
		}
		if s.current {
			return *s, true
		}
		if s.primary && primary == nil {
			primary = s
		}
		if first == nil {
			first = s
		}
	}
	if primary != nil {
		return *primary, true
	}
	if first != nil {
		return *first, true
	}
	return screenSize{}, false
}

// domReady sizes the hidden window to fit the current monitor, then shows it.
// It runs once; dev-mode reloads fire OnDomReady again.
func (a *App) domReady(ctx context.Context) {
	if a.windowShown {
		return
	}
	a.windowShown = true
	defer runtime.WindowShow(ctx)

	screens, err := runtime.ScreenGetAll(ctx)
	if err != nil {
		return
	}
	sizes := make([]screenSize, 0, len(screens))
	for _, s := range screens {
		sizes = append(sizes, screenSize{W: s.Size.Width, H: s.Size.Height, current: s.IsCurrent, primary: s.IsPrimary})
	}
	scr, ok := pickScreen(sizes)
	if !ok {
		return
	}
	saved, _ := a.window.Load() // an unreadable file just means the default size
	p := planWindow(scr.W, scr.H, saved)
	runtime.WindowSetMinSize(ctx, p.MinWidth, p.MinHeight)
	runtime.WindowSetSize(ctx, p.Width, p.Height)
	runtime.WindowCenter(ctx)
	if p.Maximise {
		runtime.WindowMaximise(ctx)
	}
}

// beforeClose remembers the window size for next launch. It never blocks closing.
func (a *App) beforeClose(ctx context.Context) bool {
	if runtime.WindowIsMinimised(ctx) {
		return false
	}
	w, _ := a.window.Load() // keeps the last normal size while maximised
	w.Maximised = runtime.WindowIsMaximised(ctx)
	if !w.Maximised {
		w.Width, w.Height = runtime.WindowGetSize(ctx)
	}
	_ = a.window.Save(w) // best effort: losing it only means the default size next time
	return false
}

func clamp(v, lo, hi int) int {
	return max(lo, min(v, hi))
}
