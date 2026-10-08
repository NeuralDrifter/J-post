// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

package main

import "strings"

// Small string helpers shared across the app.

// dateLayout is used for calendar dates (date applied, follow-up date), local time.
const dateLayout = "2006-01-02"

// firstN returns at most the first n characters of s (whole characters, never a
// split UTF-8 sequence).
func firstN(s string, n int) string {
	i := 0
	for pos := range s {
		if i == n {
			return s[:pos]
		}
		i++
	}
	return s
}

// truncate is firstN with "…" added when something was cut.
func truncate(s string, n int) string {
	if cut := firstN(s, n); len(cut) < len(s) {
		return cut + "…"
	}
	return s
}

// datePart keeps the YYYY-MM-DD part of a timestamp such as "2026-09-30T12:00:00Z".
func datePart(s string) string { return firstN(s, len(dateLayout)) }

// orDefault returns s trimmed, or fallback when that leaves nothing.
func orDefault(s, fallback string) string {
	if s = strings.TrimSpace(s); s == "" {
		return fallback
	}
	return s
}

// normalizeForMatch lowercases and collapses whitespace, so "Senior  Go Dev"
// and "senior go dev" compare equal.
func normalizeForMatch(s string) string {
	return strings.Join(strings.Fields(strings.ToLower(s)), " ")
}

func lastLine(s, fallback string) string {
	lines := strings.Split(strings.TrimSpace(s), "\n")
	for i := len(lines) - 1; i >= 0; i-- {
		if l := strings.TrimSpace(lines[i]); l != "" {
			return l
		}
	}
	return fallback
}
