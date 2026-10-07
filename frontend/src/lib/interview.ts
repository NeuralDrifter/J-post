import type { main } from './backend'

export const SCORE_DIMENSIONS: [keyof main.ScoreSet, string][] = [
  ['communication', 'Communication'],
  ['structure', 'Structure'],
  ['relevance', 'Relevance'],
  ['depth', 'Depth'],
  ['confidence', 'Confidence'],
]

export function averageScore(s?: main.ScoreSet): number | undefined {
  if (!s) return undefined
  const values = SCORE_DIMENSIONS.map(([k]) => s[k])
  return Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10
}

/** "4:05" */
export function clock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

// A prepared session is handed from the setup dialog to the live page in memory;
// the token never goes into the URL or storage. Reading doesn't consume it (React
// may run state setup twice in development); the page releases it when done.
const pending = new Map<string, main.LiveSession>()
export const holdSession = (s: main.LiveSession) => pending.set(s.sessionId, s)
export const peekSession = (id: string) => pending.get(id)
export const releaseSession = (id: string) => pending.delete(id)
