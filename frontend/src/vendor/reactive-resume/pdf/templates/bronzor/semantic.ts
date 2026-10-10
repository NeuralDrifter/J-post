// Derived from Reactive Resume (https://github.com/reactive-resume/reactive-resume), commit b3d8266.
// Copyright (c) 2026 Amruth Pillai. SPDX-License-Identifier: MIT
import type { TemplateSemanticManifest } from "../../semantic/template-manifest";
import { itemHeaderRowPart } from "../../semantic/shared-parts";

export const bronzorSemanticManifest = {
	template: "bronzor",
	regions: [
		{ name: "header", placement: "main", origins: [] },
		{ name: "main", placement: "main", origins: ["sidebar", "main"], flow: "interleaved" },
	],
	header: { region: "header", placement: "main" },
	specialSummary: null,
	parts: [
		itemHeaderRowPart,
		{
			name: "interleaved-section-row",
			key: "interleaved-section-row",
			owner: { kind: "section", key: "section", placement: "main" },
			binding: {
				type: "alias",
				canonicalKind: "section",
				token: "interleaved-section-row",
			},
		},
	],
} as const satisfies TemplateSemanticManifest;
