// Derived from Reactive Resume (https://github.com/reactive-resume/reactive-resume), commit b3d8266.
// Copyright (c) 2026 Amruth Pillai. SPDX-License-Identifier: MIT
type WebsiteDisplay = {
	url: string;
	label?: string | undefined;
};

type CustomFieldLink = {
	link?: string | undefined;
};

export const getWebsiteDisplayText = (website: WebsiteDisplay): string => {
	const label = website.label?.trim();

	return label || website.url;
};

export const getCustomFieldLinkUrl = (field: CustomFieldLink): string | undefined => {
	const link = field.link?.trim();

	return link || undefined;
};
