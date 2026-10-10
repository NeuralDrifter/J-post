// Derived from Reactive Resume (https://github.com/reactive-resume/reactive-resume), commit b3d8266.
// Copyright (c) 2026 Amruth Pillai. SPDX-License-Identifier: MIT
export type SemanticNodeKind =
	| "resume"
	| "page"
	| "region"
	| "header"
	| "picture"
	| "name"
	| "headline"
	| "contact-list"
	| "contact-item"
	| "section"
	| "section-heading"
	| "section-items"
	| "item"
	| "item-header"
	| "combined-text"
	| "field"
	| "link"
	| "icon"
	| "level"
	| "rich-text"
	| "rich-heading"
	| "blockquote"
	| "paragraph"
	| "list"
	| "list-item"
	| "list-item-content"
	| "list-marker"
	| "strong"
	| "emphasis"
	| "underline"
	| "strike"
	| "code"
	| "text-span"
	| "mark"
	| "hard-break"
	| "horizontal-rule"
	| "template-part";

export type SemanticNode = {
	key: string;
	kind: SemanticNodeKind;
	id?: string;
	attributes: Readonly<Record<string, string>>;
	roles: readonly string[];
	children: readonly SemanticNode[];
};
