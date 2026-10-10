// Derived from Reactive Resume (https://github.com/reactive-resume/reactive-resume), commit b3d8266.
// Copyright (c) 2026 Amruth Pillai. SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import { defaultResumeData } from "@reactive-resume/schema/resume/default";
import { parseReactiveResumeJSON } from "./reactive-resume-json";

describe("parseReactiveResumeJSON", () => {
	it("creates a default layout page when the imported data has no pages", () => {
		const data = structuredClone(defaultResumeData);
		data.metadata.layout.pages = [];

		const result = parseReactiveResumeJSON(JSON.stringify(data));
		expect(result.metadata.layout.pages.length).toBe(1);
		expect(result.metadata.layout.pages[0]?.main.length).toBeGreaterThan(0);
	});

	it("recovers missing built-in sections by appending them to the first page", () => {
		const data = structuredClone(defaultResumeData);
		data.metadata.layout.pages = [
			{
				fullWidth: false,
				main: ["experience"],
				sidebar: ["skills"],
			},
		];

		const result = parseReactiveResumeJSON(JSON.stringify(data));
		const firstPage = result.metadata.layout.pages[0];
		expect(firstPage).toBeDefined();
		const allIds = new Set([...(firstPage?.main ?? []), ...(firstPage?.sidebar ?? [])]);

		// Every built-in section (except cover-letter) ends up somewhere on page 1.
		for (const expected of ["education", "projects", "languages", "awards"]) {
			expect(allIds.has(expected), expected).toBe(true);
		}
		// The originally-placed sections remain where the user put them.
		expect(firstPage?.sidebar).toContain("skills");
		expect(firstPage?.main[0]).toBe("experience");
	});
});
