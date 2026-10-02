import type { main } from './backend'

export const MOCK_KINDS: [string, string][] = [
  ['phone_screen', 'Phone screen'],
  ['behavioral', 'Behavioral'],
  ['technical', 'Technical (talk-through)'],
  ['hiring_manager', 'Hiring manager'],
  ['final_round', 'Final round'],
]
export const MOCK_KIND_LABEL = Object.fromEntries(MOCK_KINDS) as Record<string, string>

export const MOCK_LENGTHS = [10, 25, 45]

export const MOCK_PERSONAS: [string, string, string][] = [
  ['friendly', 'Friendly', 'Warm and encouraging'],
  ['neutral', 'Neutral', 'Professional, like most real interviews'],
  ['tough', 'Tough', 'Probes vague answers and pushes back'],
]

export const MOCK_VOICES = ['Kore', 'Puck', 'Charon', 'Aoede']

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
// the token never goes into the URL or storage.
const pending = new Map<string, main.LiveSession>()
export const holdSession = (s: main.LiveSession) => pending.set(s.sessionId, s)
export const takeSession = (id: string) => {
  const s = pending.get(id)
  pending.delete(id)
  return s
}
