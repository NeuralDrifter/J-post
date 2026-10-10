// Derived from Reactive Resume (https://github.com/reactive-resume/reactive-resume), commit b3d8266.
// Copyright (c) 2026 Amruth Pillai. SPDX-License-Identifier: MIT
import type { SectionTitleResolver } from "./builder";
import type { ResumeData } from "@reactive-resume/schema/resume/data";
import { Packer } from "docx";
import { parseResumeData } from "@reactive-resume/schema/resume/data";
import { buildDocument } from "./builder";

/**
 * Builds a DOCX file from resume data and returns it as a Blob. Pass `resolveTitle` to fill in
 * locale-aware section headings (titles are stored empty and resolved at render time).
 */
// oxlint-disable-next-line require-await -- keep synchronous renderer errors on the public Promise rejection path.
export async function buildDocx(data: ResumeData, resolveTitle?: SectionTitleResolver): Promise<Blob> {
	const doc = buildDocument(parseResumeData(data), resolveTitle);
	return Packer.toBlob(doc);
}
