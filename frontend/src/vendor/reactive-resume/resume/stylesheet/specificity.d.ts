// Derived from Reactive Resume (https://github.com/reactive-resume/reactive-resume), commit b3d8266.
// Copyright (c) 2026 Amruth Pillai. SPDX-License-Identifier: MIT
declare module "@bramus/specificity" {
	type CalculatedSpecificity = {
		toArray(): [number, number, number];
	};
	class Specificity {
		static calculateForAST(selector: object): CalculatedSpecificity;
	}

	export default Specificity;
}
