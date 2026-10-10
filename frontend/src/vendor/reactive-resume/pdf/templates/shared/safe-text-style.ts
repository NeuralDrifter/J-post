// Derived from Reactive Resume (https://github.com/reactive-resume/reactive-resume), commit b3d8266.
// Copyright (c) 2026 Amruth Pillai. SPDX-License-Identifier: MIT
import type { Style } from "../../forme/style-types";

export const safeTextStyle = {
	minWidth: 0,
	maxWidth: "100%",
	flexShrink: 1,
} satisfies Style;
