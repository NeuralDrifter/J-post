// Derived from Reactive Resume (https://github.com/reactive-resume/reactive-resume), commit b3d8266.
// Copyright (c) 2026 Amruth Pillai. SPDX-License-Identifier: MIT
import type { ResumeData } from "@reactive-resume/schema/resume/data";
import { describe, expect, it } from "vitest";
import { produce } from "immer";
import { customSectionItemDefinitionByType } from "@reactive-resume/schema/resume/data";
import { defaultResumeData } from "@reactive-resume/schema/resume/default";
import { CUSTOM_SECTION_TYPES, createEntry, moveSection } from "./model";

const resume = (edit?: (data: ResumeData) => void) => {
	const data = structuredClone(defaultResumeData);
	data.metadata.layout.pages = [
		{ fullWidth: false, main: ["summary", "experience", "education"], sidebar: ["skills"] },
	];
	edit?.(data);
	return data;
};

const withEntries = (data: ResumeData, ...types: ("experience" | "education" | "skills")[]) => {
	for (const type of types) {
		const entry = createEntry(type) as { name?: string; company?: string; school?: string };
		if (type === "experience") entry.company = "Lumen";
		if (type === "education") entry.school = "UdK";
		if (type === "skills") entry.name = "Figma";
		(data.sections[type].items as unknown[]).push(entry);
	}
};

describe("createEntry", () => {
	it.each(CUSTOM_SECTION_TYPES)("makes a %s entry the schema accepts", (type) => {
		const entry = createEntry(type);
		expect(customSectionItemDefinitionByType[type].schema.safeParse(entry).success).toBe(true);
	});
});

describe("outline", () => {
	it("moves a section before a row when moving up and after it when moving down", () => {
		const data = resume((draft) => withEntries(draft, "experience", "education", "skills"));
		const up = produce(data, (draft) =>
			moveSection(draft, "education", { id: "experience", page: 0, column: "main" }, "up"),
		);
		expect(up.metadata.layout.pages[0]?.main).toEqual(["summary", "education", "experience"]);

		const down = produce(data, (draft) =>
			moveSection(draft, "experience", { id: "education", page: 0, column: "main" }, "down"),
		);
		expect(down.metadata.layout.pages[0]?.main).toEqual(["summary", "education", "experience"]);
	});

	it("changes column when a section moves across the sidebar divider", () => {
		const data = resume((draft) => withEntries(draft, "experience", "skills"));
		const moved = produce(data, (draft) =>
			moveSection(draft, "skills", { id: "experience", page: 0, column: "main" }, "up"),
		);
		expect(moved.metadata.layout.pages[0]).toMatchObject({
			main: ["summary", "skills", "experience", "education"],
			sidebar: [],
		});
	});
});
