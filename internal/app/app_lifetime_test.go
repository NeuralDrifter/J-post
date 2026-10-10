// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

package app

import (
	"context"
	"testing"
)

func TestShutdownCancelsBackgroundWork(t *testing.T) {
	a := NewApp(t.TempDir())
	ctx := a.lifetimeContext()
	if ctx.Err() != nil {
		t.Fatal("background work should be allowed while the app is open")
	}
	a.shutdown(context.Background())
	if ctx.Err() == nil {
		t.Fatal("closing the app must cancel running work (searches, headless Claude Code, API calls)")
	}
}
