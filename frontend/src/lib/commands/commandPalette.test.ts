// @vitest-environment happy-dom
// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

import { beforeEach, describe, expect, it } from 'vitest'
import {
  filterAndRankCommands,
  loadRecentCommandIds,
  recordRecentCommandId,
  scoreCommandMatch,
  shouldOpenCommandPalette,
  targetUsesCtrlK,
} from './commandPalette'

describe('scoreCommandMatch and filterAndRankCommands', () => {
  const items = [
    { title: 'Pipeline', subtitle: 'Job tracking board' },
    { title: 'Discover', subtitle: 'Search new postings' },
    { title: 'ATS checker', subtitle: 'Test any PDF resume' },
    { title: 'Software Engineer', subtitle: 'Acme Corp' },
    { title: 'Senior Backend Developer', subtitle: 'Google' },
    { title: 'Product Manager', subtitle: 'Stripe', keywords: ['payments', 'fintech'] },
  ]

  it('ranks exact match highest', () => {
    const results = filterAndRankCommands(items, 'Pipeline')
    expect(results[0].title).toBe('Pipeline')
    expect(scoreCommandMatch('Pipeline', 'Pipeline')).toBeGreaterThan(scoreCommandMatch('Pipe', 'PipeX'))
  })

  it('ranks prefix matches before substring matches', () => {
    const results = filterAndRankCommands(
      [
        { title: 'Backend Services' },
        { title: 'Senior Backend' },
      ],
      'Back',
    )
    expect(results[0].title).toBe('Backend Services')
  })

  it('matches words inside title', () => {
    const results = filterAndRankCommands(items, 'Engineer')
    expect(results[0].title).toBe('Software Engineer')
  })

  it('matches subtitles like company names', () => {
    const results = filterAndRankCommands(items, 'Google')
    expect(results[0].title).toBe('Senior Backend Developer')
  })

  it('matches keywords', () => {
    const results = filterAndRankCommands(items, 'fintech')
    expect(results[0].title).toBe('Product Manager')
  })

  it('returns all items when query is empty', () => {
    expect(filterAndRankCommands(items, '')).toEqual(items)
    expect(filterAndRankCommands(items, '   ')).toEqual(items)
  })

  it('filters out non-matching items', () => {
    const results = filterAndRankCommands(items, 'zzzznotfound')
    expect(results).toHaveLength(0)
  })
})

describe('shouldOpenCommandPalette and targetUsesCtrlK', () => {
  it('opens on Ctrl+K when no dialog is open', () => {
    expect(shouldOpenCommandPalette({ key: 'k', ctrlKey: true, target: null }, false)).toBe(true)
    expect(shouldOpenCommandPalette({ key: 'K', ctrlKey: true, target: null }, false)).toBe(true)
  })

  it('opens on Cmd+K on macOS', () => {
    expect(shouldOpenCommandPalette({ key: 'k', metaKey: true, target: null }, false)).toBe(true)
  })

  it('does not open when a dialog is already open', () => {
    expect(shouldOpenCommandPalette({ key: 'k', ctrlKey: true, target: null }, true)).toBe(false)
  })

  it('does not open for other keys or with Alt pressed', () => {
    expect(shouldOpenCommandPalette({ key: 'j', ctrlKey: true, target: null }, false)).toBe(false)
    expect(shouldOpenCommandPalette({ key: 'k', ctrlKey: true, altKey: true, target: null }, false)).toBe(false)
    expect(shouldOpenCommandPalette({ key: 'k', ctrlKey: false, target: null }, false)).toBe(false)
  })

  it('does not open when typing in a rich text editor that uses Ctrl+K for links', () => {
    const container = document.createElement('div')
    container.className = 'ProseMirror'
    const editable = document.createElement('p')
    container.appendChild(editable)
    document.body.appendChild(container)

    expect(targetUsesCtrlK(editable)).toBe(true)
    expect(shouldOpenCommandPalette({ key: 'k', ctrlKey: true, target: editable }, false)).toBe(false)

    document.body.removeChild(container)
  })

  it('does not open when typing inside element marked with data-uses-ctrl-k', () => {
    const input = document.createElement('input')
    input.setAttribute('data-uses-ctrl-k', 'true')
    document.body.appendChild(input)

    expect(targetUsesCtrlK(input)).toBe(true)
    expect(shouldOpenCommandPalette({ key: 'k', ctrlKey: true, target: input }, false)).toBe(false)

    document.body.removeChild(input)
  })

  it('opens when typing in a standard input that does not use Ctrl+K', () => {
    const normalInput = document.createElement('input')
    document.body.appendChild(normalInput)

    expect(targetUsesCtrlK(normalInput)).toBe(false)
    expect(shouldOpenCommandPalette({ key: 'k', ctrlKey: true, target: normalInput }, false)).toBe(true)

    document.body.removeChild(normalInput)
  })
})

describe('recents management', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('records recent item IDs with deduplication and limit', () => {
    expect(loadRecentCommandIds()).toEqual([])

    recordRecentCommandId('item-1')
    recordRecentCommandId('item-2')
    recordRecentCommandId('item-3')
    recordRecentCommandId('item-1') // Moves item-1 to top

    expect(loadRecentCommandIds()).toEqual(['item-1', 'item-3', 'item-2'])

    recordRecentCommandId('item-4')
    recordRecentCommandId('item-5')
    recordRecentCommandId('item-6')

    const recents = loadRecentCommandIds()
    expect(recents).toHaveLength(5)
    expect(recents[0]).toBe('item-6')
  })
})
