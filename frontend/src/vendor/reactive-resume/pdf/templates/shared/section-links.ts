// Derived from Reactive Resume (https://github.com/reactive-resume/reactive-resume), commit b3d8266.
// Copyright (c) 2026 Amruth Pillai. SPDX-License-Identifier: MIT
import type { Website } from "@reactive-resume/schema/resume/data";

type ItemWebsite = Website & {
	inlineLink?: boolean | undefined;
};

export const getInlineItemWebsiteUrl = (website: ItemWebsite): string | undefined => {
	if (!website.url || !website.inlineLink) return undefined;

	return website.url;
};

export const shouldRenderSeparateItemWebsite = (website: ItemWebsite): boolean => {
	return Boolean(website.url && !website.inlineLink);
};
