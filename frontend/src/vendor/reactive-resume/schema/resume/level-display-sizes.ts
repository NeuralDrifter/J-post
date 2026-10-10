// Derived from Reactive Resume (https://github.com/reactive-resume/reactive-resume), commit b3d8266.
// Copyright (c) 2026 Amruth Pillai. SPDX-License-Identifier: MIT
type ResolveLevelDisplaySizesOptions = {
	bodyFontSize: number;
	iconFontSize?: number | undefined;
	levelFontSize?: number | undefined;
};

type LevelDisplaySizes = {
	decorationSize: number;
	levelIconExplicitSize?: number | undefined;
};

export const resolveLevelDisplaySizes = (options: ResolveLevelDisplaySizesOptions): LevelDisplaySizes => {
	const defaultDecorationSize = options.bodyFontSize - 2;
	const legacyLevelIconSize = defaultDecorationSize + 4;

	const decorationSize = options.levelFontSize ?? options.iconFontSize ?? defaultDecorationSize;

	if (options.levelFontSize !== undefined) {
		return { decorationSize, levelIconExplicitSize: options.levelFontSize };
	}

	if (options.iconFontSize !== undefined) {
		return { decorationSize };
	}

	return { decorationSize, levelIconExplicitSize: legacyLevelIconSize };
};
