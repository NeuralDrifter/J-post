// Derived from Reactive Resume (https://github.com/reactive-resume/reactive-resume), commit b3d8266.
// Copyright (c) 2026 Amruth Pillai. SPDX-License-Identifier: MIT
import type { TemplateSemanticManifest } from "../../semantic/template-manifest";
import { baseManifest, itemHeaderRowPart } from "../../semantic/shared-parts";

export const pikachuSemanticManifest = baseManifest("pikachu", [
	itemHeaderRowPart,
	{
		name: "header-divider",
		key: "header-divider",
		owner: { kind: "header", key: "header" },
		binding: { type: "primitive", primitive: "View", source: "existing" },
		route: { parent: "owner", at: "start", take: [{ kind: "name" }, { kind: "headline" }] },
	},
]) satisfies TemplateSemanticManifest;
