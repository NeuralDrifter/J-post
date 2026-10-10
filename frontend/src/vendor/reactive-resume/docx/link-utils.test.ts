// Derived from Reactive Resume (https://github.com/reactive-resume/reactive-resume), commit b3d8266.
// Copyright (c) 2026 Amruth Pillai. SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import { toSafeDocxLink } from "./link-utils";

describe("toSafeDocxLink", () => {
	it("accepts https URLs", () => {
		expect(toSafeDocxLink("https://example.com")).toBe("https://example.com/");
	});

	it("rejects javascript: protocol", () => {
		expect(toSafeDocxLink("javascript:alert(1)")).toBeNull();
		expect(toSafeDocxLink("data:text/html,<script>alert(1)</script>")).toBeNull();
		expect(toSafeDocxLink("file:///etc/passwd")).toBeNull();
		expect(toSafeDocxLink("ftp://example.com")).toBeNull();
	});

	it("accepts tel: phone links", () => {
		expect(toSafeDocxLink("tel:+1 555 123 4567")).toBe("tel:+1 555 123 4567");
	});

	it("rejects malformed URLs", () => {
		expect(toSafeDocxLink("not a url at all")).toBeNull();
	});
});
