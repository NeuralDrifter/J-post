// Derived from Reactive Resume (https://github.com/reactive-resume/reactive-resume), commit b3d8266.
// Copyright (c) 2026 Amruth Pillai. SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import { resolveLevelDisplaySizes } from "./level-display-sizes";

describe("resolveLevelDisplaySizes", () => {
	it("uses typography defaults when no custom font sizes are set", () => {
		expect(resolveLevelDisplaySizes({ bodyFontSize: 12 })).toEqual({
			decorationSize: 10,
			levelIconExplicitSize: 14,
		});
	});

	it("uses the level font size for all level display visuals", () => {
		expect(resolveLevelDisplaySizes({ bodyFontSize: 12, levelFontSize: 16 })).toEqual({
			decorationSize: 16,
			levelIconExplicitSize: 16,
		});
	});
});
