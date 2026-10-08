// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

package app

import (
	"context"
	"testing"
)

func TestShutdownCancelsAIRuns(t *testing.T) {
	a := NewApp(t.TempDir())
	ctx := a.aiContext()
	if ctx.Err() != nil {
		t.Fatal("AI runs should be allowed while the app is open")
	}
	a.shutdown(context.Background())
	if ctx.Err() == nil {
		t.Fatal("closing the app must cancel running AI work (headless Claude Code, API calls)")
	}
}
