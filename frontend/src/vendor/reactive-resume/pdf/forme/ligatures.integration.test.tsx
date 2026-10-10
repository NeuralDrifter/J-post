// Derived from Reactive Resume (https://github.com/reactive-resume/reactive-resume), commit b3d8266.
// Copyright (c) 2026 Amruth Pillai. SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import * as forme from "@formepdf/core";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { defaultResumeData } from "@reactive-resume/schema/resume/default";
import { renderResume } from "./render";

const words = "Profiles efficient office affluent flourish";

const extractedText = async (fontFamily: string) => {
	const data = structuredClone(defaultResumeData);
	data.picture.hidden = true;
	data.basics.name = "Ligature Probe";
	data.summary.content = `<p>${words}</p>`;
	data.metadata.layout.pages = [{ fullWidth: true, main: ["summary"], sidebar: [] }];
	data.metadata.typography.body.fontFamily = fontFamily;
	data.metadata.typography.heading.fontFamily = fontFamily;
	const { pdf } = await renderResume(forme, { data, template: "onyx" });
	const document = await getDocument({ data: pdf }).promise;
	const page = await document.getPage(1);
	return (await page.getTextContent()).items.map((item) => ("str" in item ? item.str : "")).join(" ");
};

// Keep native fi/fl/ff shaping while preserving every source letter in the exported text layer.
describe("ligatures", () => {
	it("extract whole words in IBM Plex Serif", { timeout: 60_000 }, async () => {
		const text = (await extractedText("IBM Plex Serif")).replaceAll(/\s+/g, " ");
		for (const word of words.split(" ")) expect(text).toContain(word);
	});
});
