// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

package textproc

import (
	"testing"
	"unicode/utf8"
)

func TestFirstNAndTruncateCutWholeCharacters(t *testing.T) {
	if got := FirstN("2026-09-30T12:00:00Z", 10); got != "2026-09-30" {
		t.Fatalf("firstN = %q", got)
	}
	if got := FirstN("short", 10); got != "short" {
		t.Fatalf("firstN short = %q", got)
	}
	cut := Truncate("café crème", 4)
	if cut != "café…" || !utf8.ValidString(cut) {
		t.Fatalf("truncate = %q", cut)
	}
	if got := Truncate("fits", 4); got != "fits" {
		t.Fatalf("no cut needed: %q", got)
	}
}

func TestOrDefault(t *testing.T) {
	if OrDefault("  ", "none") != "none" || OrDefault(" x ", "none") != "x" {
		t.Fatal("orDefault")
	}
}

func TestNormalizeForMatch(t *testing.T) {
	if got := NormalizeForMatch("  Senior   Go\tDeveloper "); got != "senior go developer" {
		t.Fatalf("got %q", got)
	}
}
