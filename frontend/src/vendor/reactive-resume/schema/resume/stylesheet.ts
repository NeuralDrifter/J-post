// Derived from Reactive Resume (https://github.com/reactive-resume/reactive-resume), commit b3d8266.
// Copyright (c) 2026 Amruth Pillai. SPDX-License-Identifier: MIT
import { z } from "zod";

export const EMPTY_SEMANTIC_CSS_SOURCE = "";

export const stylesheetSourceSchema = z.strictObject({
	languageVersion: z.number().int().positive(),
	text: z.string(),
});

const canonicalSemanticStylesheetSchema = z.strictObject({
	mode: z.enum(["legacy", "semantic"]),
	source: stylesheetSourceSchema,
});

type SemanticStylesheetInput = z.input<typeof canonicalSemanticStylesheetSchema>;

const normalizeHistoricalStylesheet = (input: unknown): unknown => {
	if (typeof input !== "object" || input === null || Array.isArray(input) || !Object.hasOwn(input, "applied")) {
		return input;
	}

	const { applied, ...stylesheet } = input as Record<string, unknown>;
	return stylesheetSourceSchema.safeParse(applied).success ? stylesheet : input;
};

const semanticStylesheetCompatibilityTransform = z.transform<SemanticStylesheetInput, SemanticStylesheetInput>(
	(input) => normalizeHistoricalStylesheet(input) as SemanticStylesheetInput,
);

export const semanticStylesheetSchema = semanticStylesheetCompatibilityTransform.pipe(
	canonicalSemanticStylesheetSchema,
);

export type StylesheetSource = z.infer<typeof stylesheetSourceSchema>;
export type SemanticStylesheet = z.infer<typeof semanticStylesheetSchema>;
export type StylesheetMode = SemanticStylesheet["mode"];
