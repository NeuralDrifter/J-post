// Derived from Reactive Resume (https://github.com/reactive-resume/reactive-resume), commit b3d8266.
// Copyright (c) 2026 Amruth Pillai. SPDX-License-Identifier: MIT
import type { CustomSectionType } from "./data";

export const defaultSectionIconNames = {
	summary: "article",
	profiles: "messenger-logo",
	experience: "briefcase",
	education: "graduation-cap",
	projects: "code-simple",
	skills: "compass-tool",
	languages: "translate",
	interests: "football",
	awards: "trophy",
	certifications: "certificate",
	publications: "books",
	volunteer: "hand-heart",
	references: "phone",
	"cover-letter": "envelope-simple",
} as const satisfies Record<CustomSectionType, string>;

export const getDefaultSectionIconName = (sectionType: CustomSectionType): string =>
	defaultSectionIconNames[sectionType];
