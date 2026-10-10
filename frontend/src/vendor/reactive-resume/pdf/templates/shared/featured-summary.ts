// Derived from Reactive Resume (https://github.com/reactive-resume/reactive-resume), commit b3d8266.
// Copyright (c) 2026 Amruth Pillai. SPDX-License-Identifier: MIT
type FeaturedSummaryLayoutInput = {
	sections: string[];
	canFeatureSummary: boolean;
};

type FeaturedSummaryLayout = {
	featuredSummarySection: "summary" | undefined;
	regularSections: string[];
};

export const getFeaturedSummaryLayout = ({
	sections,
	canFeatureSummary,
}: FeaturedSummaryLayoutInput): FeaturedSummaryLayout => {
	const featuredSummarySection = canFeatureSummary && sections.includes("summary") ? "summary" : undefined;

	return {
		featuredSummarySection,
		regularSections: featuredSummarySection ? sections.filter((section) => section !== "summary") : sections,
	};
};
