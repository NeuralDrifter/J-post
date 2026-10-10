// Derived from Reactive Resume (https://github.com/reactive-resume/reactive-resume), commit b3d8266.
// Copyright (c) 2026 Amruth Pillai. SPDX-License-Identifier: MIT
export const hasSplitRowText = (value: string | undefined): value is string => {
	return typeof value === "string" && value.trim().length > 0;
};
