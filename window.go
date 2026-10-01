package main

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
