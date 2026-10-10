// Derived from Reactive Resume (https://github.com/reactive-resume/reactive-resume), commit b3d8266.
// Copyright (c) 2026 Amruth Pillai. SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import { parse } from "node-html-parser";
import { isRichTextElementInsideOrderedList } from "./rich-text-spacing";

const requireElement = <T>(element: T | null | undefined): T => {
	expect(element).toBeDefined();
	if (!element) throw new Error("Expected element to exist.");

	return element;
};

describe("isRichTextElementInsideOrderedList", () => {
	it("uses the nearest list ancestor when ordered and unordered lists are nested", () => {
		const unorderedNestedInOrdered = parse("<ol><li><ul><li>Nested unordered item.</li></ul></li></ol>").querySelector(
			"ul li",
		);
		const orderedNestedInUnordered = parse("<ul><li><ol><li>Nested ordered item.</li></ol></li></ul>").querySelector(
			"ol li",
		);

		expect(isRichTextElementInsideOrderedList(requireElement(unorderedNestedInOrdered))).toBe(false);
		expect(isRichTextElementInsideOrderedList(requireElement(orderedNestedInUnordered))).toBe(true);
	});
});
