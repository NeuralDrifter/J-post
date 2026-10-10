// Derived from Reactive Resume (https://github.com/reactive-resume/reactive-resume), commit b3d8266.
// Copyright (c) 2026 Amruth Pillai. SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import { Document, Page, Text } from "./primitives";
import { renderHostTree } from "./reconciler";
import { toFormeDocument } from "./to-forme";

type SerializedNode = { kind: { type: string }; style: Record<string, unknown>; children: SerializedNode[] };

describe("toFormeDocument", () => {
	// Forme's Text paints no background, border or padding, so a section heading drawn as a filled bar or an underlined
	// title vanished whenever its icon (which made it a box) was hidden.
	it("puts a text's background, border and padding on a box around it", () => {
		const tree = renderHostTree(
			<Document>
				<Page>
					<Text style={{ backgroundColor: "#24346E", borderBottomWidth: 1, paddingTop: 4, color: "#ffffff" }}>Bar</Text>
				</Page>
			</Document>,
		);
		const { document } = toFormeDocument(tree) as unknown as { document: { children: SerializedNode[] } };
		const [box] = document.children[0]?.children ?? [];

		expect(box?.kind.type).toBe("View");
		expect(box?.style).toMatchObject({ backgroundColor: expect.anything(), padding: { top: 4 } });
		expect(box?.style).toHaveProperty("borderWidth");
		expect(box?.children[0]?.kind.type).toBe("Text");
		expect(box?.children[0]?.style).not.toHaveProperty("backgroundColor");
		expect(box?.children[0]?.style).toHaveProperty("color");
	});
});
