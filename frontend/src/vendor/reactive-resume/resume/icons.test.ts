// Derived from Reactive Resume (https://github.com/reactive-resume/reactive-resume), commit b3d8266.
// Copyright (c) 2026 Amruth Pillai. SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import { getNetworkIcon } from "./icons";

describe("getNetworkIcon", () => {
	it("matches Twitter and X variants", () => {
		expect(getNetworkIcon("twitter")).toBe("twitter-logo");
		expect(getNetworkIcon("x")).toBe("twitter-logo");
		expect(getNetworkIcon("x.com")).toBe("twitter-logo");
	});

	it("matches a network named inside a longer label", () => {
		expect(getNetworkIcon("My GitHub Profile")).toBe("github-logo");
	});

	it.each(["Xing", "Dropbox", "Stack Exchange", "Mixcloud", "Fox"])("does not give %s the X logo", (network) => {
		expect(getNetworkIcon(network)).not.toBe("twitter-logo");
	});
});
