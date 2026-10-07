package main

import (
	"testing"
	"unicode/utf8"
)

func TestFirstNAndTruncateCutWholeCharacters(t *testing.T) {
	if got := firstN("2026-09-30T12:00:00Z", 10); got != "2026-09-30" {
		t.Fatalf("firstN = %q", got)
	}
	if got := firstN("short", 10); got != "short" {
		t.Fatalf("firstN short = %q", got)
	}
	cut := truncate("café crème", 4)
	if cut != "café…" || !utf8.ValidString(cut) {
		t.Fatalf("truncate = %q", cut)
	}
	if got := truncate("fits", 4); got != "fits" {
		t.Fatalf("no cut needed: %q", got)
	}
}

func TestOrDefault(t *testing.T) {
	if orDefault("  ", "none") != "none" || orDefault(" x ", "none") != "x" {
		t.Fatal("orDefault")
	}
}

func TestNormalizeForMatch(t *testing.T) {
	if got := normalizeForMatch("  Senior   Go\tDeveloper "); got != "senior go developer" {
		t.Fatalf("got %q", got)
	}
}

func TestMaxDaysOldRoundsUp(t *testing.T) {
	for hours, want := range map[int]int{0: 0, 1: 1, 24: 1, 25: 2, 48: 2} {
		if got := (fetchOptions{HoursOld: hours}).maxDaysOld(); got != want {
			t.Errorf("%d hours = %d days, want %d", hours, got, want)
		}
	}
}
