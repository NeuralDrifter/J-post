// Derived from Reactive Resume (https://github.com/reactive-resume/reactive-resume), commit b3d8266.
// Copyright (c) 2026 Amruth Pillai. SPDX-License-Identifier: MIT
import type { ResolvedNodeStyle } from "@reactive-resume/resume/stylesheet";
import { describe, expect, it } from "vitest";
import { adaptResolvedPdfNode } from "./adapter";

describe("adaptResolvedPdfNode", () => {
	it("maps resolved CSS names and structural values to the owning React PDF primitive props", () => {
		const resolved = {
			style: {
				"background-color": "#1e293b",
				"font-size": 9,
				"font-weight": "400",
				"text-decoration": "none",
			},
			structural: {
				breakBefore: "page",
				breakInside: "avoid",
				fixed: true,
				minPresenceAhead: 24,
				orphans: 2,
				widows: 3,
				pageSize: "A4",
			},
			hidden: false,
			order: 0,
		} satisfies ResolvedNodeStyle;

		expect(adaptResolvedPdfNode(resolved)).toEqual({
			style: {
				backgroundColor: "#1e293b",
				fontSize: 9,
				fontWeight: "400",
				textDecoration: "none",
			},
			break: true,
			wrap: false,
			fixed: true,
			minPresenceAhead: 24,
			orphans: 2,
			widows: 3,
			size: "A4",
		});
	});
});
