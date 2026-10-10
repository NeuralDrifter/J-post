// Derived from Reactive Resume (https://github.com/reactive-resume/reactive-resume), commit b3d8266.
// Copyright (c) 2026 Amruth Pillai. SPDX-License-Identifier: MIT
import type { TemplateSemanticManifest } from "../../semantic/template-manifest";
import { itemHeaderRowPart } from "../../semantic/shared-parts";

export const glalieSemanticManifest = {
	template: "glalie",
	regions: [
		{ name: "header", placement: "sidebar", origins: [] },
		{ name: "sidebar", placement: "sidebar", origins: ["sidebar"] },
		{ name: "main", placement: "main", origins: ["main"] },
	],
	header: { region: "header", placement: "sidebar" },
	specialSummary: null,
	parts: [
		itemHeaderRowPart,
		{
			name: "sidebar-background",
			key: "sidebar-background",
			owner: { kind: "region", key: "sidebar" },
			binding: { type: "primitive", primitive: "View", source: "existing" },
			route: { parent: "owner", at: "start" },
		},
	],
} as const satisfies TemplateSemanticManifest;
