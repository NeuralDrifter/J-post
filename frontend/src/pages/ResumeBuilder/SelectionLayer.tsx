// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

import { useState, type MouseEvent } from 'react'
import { boxStyle, nodeAt, nodesOnPage, nodeTarget, toPagePoint, type PageMap, type PageMapNode } from './pageMap'
import { useBuilderView } from './viewStore'

/** Click a block on the page to edit it: the header, a section or an entry. Hovering outlines what a click would pick. */
export function SelectionLayer({ pageIndex, pageMap }: { pageIndex: number; pageMap: PageMap }) {
  const selection = useBuilderView((s) => s.selection)
  const [hovered, setHovered] = useState<PageMapNode>()
  const page = pageMap.pages[pageIndex]
  if (!page || page.width <= 0 || page.height <= 0) return null

  const blockAt = (e: MouseEvent<HTMLDivElement>) => {
    const { x, y } = toPagePoint({ x: e.clientX, y: e.clientY }, e.currentTarget.getBoundingClientRect(), page)
    return nodeAt(pageMap, pageIndex, x, y)
  }
  const select = (e: MouseEvent<HTMLDivElement>) => {
    const node = blockAt(e)
    useBuilderView.getState().select(node ? nodeTarget(node) : null)
  }
  const selected = selection ? nodesOnPage(pageMap, pageIndex, selection) : []

  return (
    <div className={`absolute inset-0 ${hovered ? 'cursor-pointer' : ''}`} onClick={select} onMouseMove={(e) => setHovered(blockAt(e))} onMouseLeave={() => setHovered(undefined)}>
      {hovered && <Outline node={hovered} page={page} tone="hover" />}
      {selected.map((node) => (
        <Outline key={`${node.key}:${node.y}`} node={node} page={page} tone="selected" />
      ))}
    </div>
  )
}

function Outline({ node, page, tone }: { node: PageMapNode; page: { width: number; height: number }; tone: 'hover' | 'selected' }) {
  const style = tone === 'selected' ? 'outline-2 outline-accent bg-accent/5' : 'outline-1 outline-accent/50'
  return (
    <div aria-hidden className="pointer-events-none absolute" style={boxStyle(node, page)}>
      <div className={`absolute -inset-x-1.5 -inset-y-[3px] rounded-[3px] outline-solid ${style}`} />
    </div>
  )
}
