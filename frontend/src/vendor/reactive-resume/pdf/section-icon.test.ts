// Derived from Reactive Resume (https://github.com/reactive-resume/reactive-resume), commit b3d8266.
// Copyright (c) 2026 Amruth Pillai. SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import { defaultResumeData } from "@reactive-resume/schema/resume/default";
import { getResumeSectionIcon } from "./section-icon";

describe("getResumeSectionIcon", () => {
	describe("built-in sections", () => {
		it("returns empty string when icon is 'none' (user explicitly hid it)", () => {
			const data = {
				...defaultResumeData,
				sections: {
					...defaultResumeData.sections,
					skills: { ...defaultResumeData.sections.skills, icon: "none" },
				},
			};
			expect(getResumeSectionIcon(data, "skills")).toBe("");
		});
	});

	describe("custom sections", () => {
		it("falls back to the base type default when custom section icon is empty", () => {
			const data = {
				...defaultResumeData,
				customSections: [
					{
						id: "custom-1",
						type: "education" as const,
						title: "Courses",
						icon: "",
						columns: 1,
						hidden: false,
						showHeading: true,
						keepTogether: false,
						startOnNewPage: false,
						items: [],
					},
				],
			};
			expect(getResumeSectionIcon(data, "custom-1")).toBe("graduation-cap");
		});
	});
});
