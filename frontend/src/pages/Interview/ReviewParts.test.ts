import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { main } from '../../lib/backend'
import { TranscriptWithTips } from './ReviewParts'

describe('TranscriptWithTips', () => {
  it('still shows saved tips when no transcript was saved', () => {
    const tips = [{ answerAtMs: 4000, kind: 'tip', text: 'Lead with the result', provider: 'gemini-live', model: 'm' }] as main.InterviewTip[]
    const html = renderToStaticMarkup(createElement(TranscriptWithTips, { lines: [], tips, canPlay: false, onSeek: () => {} }))
    expect(html).toContain('Nothing was recorded.')
    expect(html).toContain('Lead with the result')
  })
})
