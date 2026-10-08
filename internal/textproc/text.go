// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

package textproc

import "strings"

// Small string helpers shared across the app.

// DateLayout is used for calendar dates (date applied, follow-up date), local time.
const DateLayout = "2006-01-02"

// FirstN returns at most the first n characters of s (whole characters, never a
// split UTF-8 sequence).
func FirstN(s string, n int) string {
	i := 0
	for pos := range s {
		if i == n {
			return s[:pos]
		}
		i++
	}
	return s
}

// Truncate is FirstN with "…" added when something was cut.
func Truncate(s string, n int) string {
	if cut := FirstN(s, n); len(cut) < len(s) {
		return cut + "…"
	}
	return s
}

// DatePart keeps the YYYY-MM-DD part of a timestamp such as "2026-09-30T12:00:00Z".
func DatePart(s string) string { return FirstN(s, len(DateLayout)) }

// OrDefault returns s trimmed, or fallback when that leaves nothing.
func OrDefault(s, fallback string) string {
	if s = strings.TrimSpace(s); s == "" {
		return fallback
	}
	return s
}

// NormalizeForMatch lowercases and collapses whitespace, so "Senior  Go Dev"
// and "senior go dev" compare equal.
func NormalizeForMatch(s string) string {
	return strings.Join(strings.Fields(strings.ToLower(s)), " ")
}

func LastLine(s, fallback string) string {
	lines := strings.Split(strings.TrimSpace(s), "\n")
	for i := len(lines) - 1; i >= 0; i-- {
		if l := strings.TrimSpace(lines[i]); l != "" {
			return l
		}
	}
	return fallback
}
