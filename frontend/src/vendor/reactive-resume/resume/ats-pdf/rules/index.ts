// Derived from Reactive Resume (https://github.com/reactive-resume/reactive-resume), commit b3d8266.
// Copyright (c) 2026 Amruth Pillai. SPDX-License-Identifier: MIT
import type { PdfCheck } from "../types";
import { contactChecks } from "./contact";
import { contentChecks } from "./content";
import { dateChecks } from "./dates";
import { layoutChecks } from "./layout";
import { parseabilityChecks } from "./parseability";
import { sectionChecks } from "./sections";

/** Every check, in report order: the ones that decide whether anything is readable come first. */
export const PDF_CHECKS: readonly PdfCheck[] = [
	...parseabilityChecks,
	...layoutChecks,
	...sectionChecks,
	...contactChecks,
	...dateChecks,
	...contentChecks,
];
