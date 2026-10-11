// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

// Where blocks of the resume sit on the rendered pages, as CSS that lays
// marks over a page drawn at any size.
import type { CSSProperties } from 'react'
import type { PageMap, PageMapNode, PageMapTarget } from '@reactive-resume/pdf/page-map'
import { isSameSelection } from './viewStore'

export type { PageMap, PageMapNode, PageMapTarget }

type Box = Pick<PageMapNode, 'x' | 'y' | 'width' | 'height'>
type PageSize = { width: number; height: number }

/** Markers in the margin stack this far apart when several belong to one block. */
const MARKER_STACK_PX = 26

/** The part of the resume a node draws. */
export function nodeTarget(node: PageMapNode): PageMapTarget {
  if (node.kind === 'item') return { kind: 'item', sectionId: node.sectionId, itemId: node.itemId }
  if (node.kind === 'section') return { kind: 'section', sectionId: node.sectionId }
  return { kind: 'header' }
}

/** The first box drawn for a target, on whichever page it starts. */
export const firstNodeFor = (pageMap: PageMap, target: PageMapTarget): PageMapNode | undefined =>
  pageMap.nodes.find((node) => isSameSelection(nodeTarget(node), target))

/** Every box a target draws on one page (an entry split across pages draws one on each). */
export const nodesOnPage = (pageMap: PageMap, pageIndex: number, target: PageMapTarget): PageMapNode[] =>
  pageMap.nodes.filter((node) => node.page === pageIndex && isSameSelection(nodeTarget(node), target))

/** The innermost block under a point on a page (in PDF points): an entry before its section. */
export function nodeAt(pageMap: PageMap, pageIndex: number, x: number, y: number): PageMapNode | undefined {
  const hits = pageMap.nodes.filter((n) => n.page === pageIndex && x >= n.x && x <= n.x + n.width && y >= n.y && y <= n.y + n.height)
  return hits.sort((a, b) => a.width * a.height - b.width * b.height)[0]
}

/** A pointer position on a drawn page, in the page's PDF points (the page map's units). */
export function toPagePoint(client: { x: number; y: number }, drawn: { left: number; top: number; width: number; height: number }, page: PageSize) {
  return { x: ((client.x - drawn.left) / drawn.width) * page.width, y: ((client.y - drawn.top) / drawn.height) * page.height }
}

/** A box placed over its page, in percentages, so it follows the page at any zoom. */
export function boxStyle(box: Box, page: PageSize): CSSProperties {
  return {
    left: `${(box.x / page.width) * 100}%`,
    top: `${(box.y / page.height) * 100}%`,
    width: `${(box.width / page.width) * 100}%`,
    height: `${(box.height / page.height) * 100}%`,
  }
}

/** A marker in the margin level with a box's top: 30px left of it but never off the page; `stack` moves later ones down. */
export function marginStyle(box: Box, page: PageSize, stack = 0): CSSProperties {
  return {
    left: `max(4px, calc(${(box.x / page.width) * 100}% - 30px))`,
    top: `calc(${(box.y / page.height) * 100}% - 3px + ${stack * MARKER_STACK_PX}px)`,
  }
}

/** Places a marker for each item on the page its target starts on, stacking markers that share a block. */
export function placeMarkers<T extends { target: PageMapTarget | null }>(items: readonly T[], pageMap: PageMap, pageIndex: number) {
  const perBlock = new Map<string, number>()
  return items.flatMap((item) => {
    const node = item.target ? firstNodeFor(pageMap, item.target) : undefined
    if (!node || node.page !== pageIndex) return []
    const stack = perBlock.get(node.key) ?? 0
    perBlock.set(node.key, stack + 1)
    return [{ item, node, stack }]
  })
}
