// Derived from Reactive Resume (https://github.com/reactive-resume/reactive-resume), commit b3d8266.
// Copyright (c) 2026 Amruth Pillai. SPDX-License-Identifier: MIT
export const SEMANTIC_CSS_LIMITS_V1 = Object.freeze({
	maxSourceBytes: 128 * 1024,
	maxRules: 1_024,
	maxDeclarations: 8_192,
	maxSelectorsPerRule: 64,
	maxSelectorCodePoints: 2_048,
	maxCombinatorsPerSelector: 16,
	maxFunctionDepth: 16,
	maxVariableExpansionDepth: 32,
	maxMediaNesting: 4,
	maxSemanticNodes: 20_000,
	maxAbsoluteLengthPt: 100_000,
} as const);
