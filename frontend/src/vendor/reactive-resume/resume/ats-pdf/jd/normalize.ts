// Derived from Reactive Resume (https://github.com/reactive-resume/reactive-resume), commit b3d8266.
// Copyright (c) 2026 Amruth Pillai. SPDX-License-Identifier: MIT
/**
 * Folds the cosmetic differences between a pasted job description and a PDF's extracted text:
 * compatibility characters, smart quotes, ligatures, and the several dashes that all mean "-".
 */
export function normalizeForMatching(value: string): string {
	return value
		.normalize("NFKC")
		.replaceAll("’", "'")
		.replaceAll("‘", "'")
		.replaceAll("“", '"')
		.replaceAll("”", '"')
		.replace(/[‐-―−]/g, "-")
		.replace(/[   ]/g, " ")
		.toLowerCase();
}
