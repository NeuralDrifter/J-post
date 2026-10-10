// Derived from Reactive Resume (https://github.com/reactive-resume/reactive-resume), commit b3d8266.
// Copyright (c) 2026 Amruth Pillai. SPDX-License-Identifier: MIT
import { escapeHtml } from "@reactive-resume/utils/string";
/**
 * Converts a plain-text summary and optional highlights array into an escaped HTML description.
 * Summary becomes a <p> tag, highlights become a <ul> list.
 */
export function toHtmlDescription(summary?: string, highlights?: string[]): string {
	const parts: string[] = [];

	if (summary) {
		parts.push(`<p>${escapeHtml(summary)}</p>`);
	}

	if (highlights && highlights.length > 0) {
		parts.push("<ul>");

		for (const highlight of highlights) {
			parts.push(`<li>${escapeHtml(highlight)}</li>`);
		}

		parts.push("</ul>");
	}

	return parts.join("");
}

/**
 * Converts an array of plain-text strings into an escaped HTML unordered list.
 */
export function arrayToHtmlList(items: string[]): string {
	if (items.length === 0) return "";
	return `<ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`;
}

export const BULLET_PATTERN = /^\s*[-–—•*◦‣·]\s+/;

/**
 * Converts plain-text lines into escaped HTML: a <ul> when most lines are bullets, otherwise one <p> per line.
 */
export function toHtml(lines: string[]): string {
	const cleaned = lines.map((line) => line.trim()).filter(Boolean);
	if (cleaned.length === 0) return "";

	const bulleted = cleaned.filter((line) => BULLET_PATTERN.test(line));
	if (bulleted.length >= 2 && bulleted.length * 2 >= cleaned.length) {
		const items = cleaned.map((line) => `<li>${escapeHtml(line.replace(BULLET_PATTERN, ""))}</li>`).join(""); // nosemgrep
		return `<ul>${items}</ul>`; // nosemgrep
	}

	return cleaned.map((line) => `<p>${escapeHtml(line.replace(BULLET_PATTERN, ""))}</p>`).join(""); // nosemgrep
}
