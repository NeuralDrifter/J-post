// Derived from Reactive Resume (https://github.com/reactive-resume/reactive-resume), commit b3d8266.
// Copyright (c) 2026 Amruth Pillai. SPDX-License-Identifier: MIT
declare module "wink-porter2-stemmer" {
	/** Porter Stemmer V2. Expects a single lowercase word and returns its stem. */
	function stem(word: string): string;

	export default stem;
}
