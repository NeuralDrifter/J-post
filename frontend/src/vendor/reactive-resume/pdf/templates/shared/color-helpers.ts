// Derived from Reactive Resume (https://github.com/reactive-resume/reactive-resume), commit b3d8266.
// Copyright (c) 2026 Amruth Pillai. SPDX-License-Identifier: MIT
import { parseColorString, rgbaStringToHex } from "@reactive-resume/utils/color";

/** Returns the primary color as an `rgba()` string at the given opacity, falling back to a hex color. */
export const getPrimaryTint = (primaryColor: string, opacity: number): string => {
	const primary = parseColorString(primaryColor);

	if (!primary) return rgbaStringToHex(primaryColor);

	const alpha = Math.max(0, Math.min(1, primary.a * opacity));

	return `rgba(${primary.r}, ${primary.g}, ${primary.b}, ${alpha})`;
};
