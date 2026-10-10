// Derived from Reactive Resume (https://github.com/reactive-resume/reactive-resume), commit b3d8266.
// Copyright (c) 2026 Amruth Pillai. SPDX-License-Identifier: MIT
// @vitest-environment happy-dom

import { describe, expect, it } from "vitest";
import { sampleResumeData } from "@reactive-resume/schema/resume/sample";
import { buildDocx } from "./index";

describe("buildDocx", () => {
	it("returns a Blob for the sample resume", async () => {
		const blob = await buildDocx(sampleResumeData);
		expect(blob).toBeInstanceOf(Blob);
		expect(blob.size).toBeGreaterThan(0);
	});
});
