package main

import "strings"

// Small string and number helpers shared across the app.

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

func clamp(v, lo, hi int) int {
	return max(lo, min(v, hi))
}
