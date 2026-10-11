// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

import { useState, type MouseEvent } from 'react'
import { boxStyle, nodeAt, nodesOnPage, nodeTarget, toPagePoint, type PageMap, type PageMapNode } from './pageMap'
import { useStylePick } from './stylePick'
import { useBuilderView } from './viewStore'

type Tone = 'hover' | 'selected' | 'styled'

const TONES: Record<Tone, string> = {
  hover: 'outline-1 outline-solid outline-accent/50',
  selected: 'outline-2 outline-solid outline-accent bg-accent/5',
  styled: 'outline-[1.5px] outline-dashed outline-info',
}

/**
 * Click a block on the page to edit it: the header, a section or an entry. Hovering outlines what a click
 * would pick. While Custom CSS is picking, the click aims the stylesheet instead; the blocks the rule under
 * its cursor styles are outlined, dashed.
 */
export function SelectionLayer({ pageIndex, pageMap }: { pageIndex: number; pageMap: PageMap }) {
  const selection = useBuilderView((s) => s.selection)
  const styleKeys = useBuilderView((s) => s.styleHighlight)
  const onPick = useStylePick((s) => s.onPick)
  const [hovered, setHovered] = useState<PageMapNode>()
  const page = pageMap.pages[pageIndex]
  if (!page || page.width <= 0 || page.height <= 0) return null

  const blockAt = (e: MouseEvent<HTMLDivElement>) => {
    const { x, y } = toPagePoint({ x: e.clientX, y: e.clientY }, e.currentTarget.getBoundingClientRect(), page)
    return nodeAt(pageMap, pageIndex, x, y)
  }
  const pick = (e: MouseEvent<HTMLDivElement>) => {
    const target = blockAt(e)
    if (!onPick) {
      useBuilderView.getState().select(target ? nodeTarget(target) : null)
      return
    }
    if (target) onPick(nodeTarget(target))
    useStylePick.getState().setOnPick(null)
  }
  const selected = selection ? nodesOnPage(pageMap, pageIndex, selection) : []
  const styled = styleKeys.length ? pageMap.nodes.filter((node) => node.page === pageIndex && styleKeys.includes(node.key)) : []

  return (
    <div className={`absolute inset-0 ${onPick ? 'cursor-crosshair' : hovered ? 'cursor-pointer' : ''}`} onClick={pick} onMouseMove={(e) => setHovered(blockAt(e))} onMouseLeave={() => setHovered(undefined)}>
      {hovered && <Outline node={hovered} page={page} tone="hover" />}
      {selected.map((node) => (
        <Outline key={`selected:${node.key}:${node.y}`} node={node} page={page} tone="selected" />
      ))}
      {styled.map((node) => (
        <Outline key={`styled:${node.key}:${node.y}`} node={node} page={page} tone="styled" />
      ))}
    </div>
  )
}

function Outline({ node, page, tone }: { node: PageMapNode; page: { width: number; height: number }; tone: Tone }) {
  return (
    <div aria-hidden className="pointer-events-none absolute" style={boxStyle(node, page)}>
      <div className={`absolute -inset-x-1.5 -inset-y-[3px] rounded-[3px] ${TONES[tone]}`} />
    </div>
  )
}
