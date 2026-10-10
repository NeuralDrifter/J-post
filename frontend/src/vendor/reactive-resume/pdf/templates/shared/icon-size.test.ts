// Derived from Reactive Resume (https://github.com/reactive-resume/reactive-resume), commit b3d8266.
// Copyright (c) 2026 Amruth Pillai. SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import { resolveIconSize } from "./icon-size";

describe("resolveIconSize", () => {
	it("falls back to custom style font sizes when size is omitted", () => {
		expect(
			resolveIconSize({
				styles: [{ fontSize: 10 }, { fontSize: 18 }],
			}),
		).toBe(18);
	});
});
