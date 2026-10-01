package main

import (
	"context"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

const (
	minWindowWidth    = 900
	minWindowHeight   = 600
	maxStartWidth     = 1600
	maxStartHeight    = 1000
	smallScreenWidth  = 1280
	smallScreenHeight = 720
)

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

func clamp(v, lo, hi int) int {
	return max(lo, min(v, hi))
}

// planWindow picks a window size that always fits the given screen: the saved
// size if it still fits, otherwise 85% of the screen; small screens start maximised.
func planWindow(screenW, screenH int, s Settings) windowPlan {
	p := windowPlan{MinWidth: min(minWindowWidth, screenW), MinHeight: min(minWindowHeight, screenH)}
	if s.WindowWidth > 0 && s.WindowHeight > 0 && s.WindowWidth <= screenW && s.WindowHeight <= screenH {
		p.Width = max(s.WindowWidth, p.MinWidth)
		p.Height = max(s.WindowHeight, p.MinHeight)
		p.Maximise = s.WindowMaximised
		return p
	}
	p.Width = clamp(screenW*85/100, p.MinWidth, maxStartWidth)
	p.Height = clamp(screenH*85/100, p.MinHeight, maxStartHeight)
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
	settings, _ := a.settings.Load()
	p := planWindow(scr.W, scr.H, settings)
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
	s, err := a.settings.Load()
	if err != nil {
		return false
	}
	s.WindowMaximised = runtime.WindowIsMaximised(ctx)
	if !s.WindowMaximised {
		s.WindowWidth, s.WindowHeight = runtime.WindowGetSize(ctx)
	}
	_ = a.settings.Save(s)
	return false
}
