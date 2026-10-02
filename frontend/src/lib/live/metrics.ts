// Local coaching meters, computed from the live transcript of the current answer.

const FILLERS = /\b(?:u+m+|u+h+|erm|like|you know|basically|actually|sort of|kind of|i mean)\b/gi

export function wordCount(text: string): number {
  return text.trim() ? text.trim().split(/\s+/).length : 0
}

export function countFillers(text: string): number {
  return text.match(FILLERS)?.length ?? 0
}

export type AnswerStats = { words: number; fillers: number; wpm: number; seconds: number }

/** Pace is words per minute between the first and last transcribed words of the answer. */
export function answerStats(text: string, startMs: number, endMs: number): AnswerStats {
  const words = wordCount(text)
  const ms = Math.max(0, endMs - startMs)
  return { words, fillers: countFillers(text), wpm: ms > 0 ? Math.round(words / (ms / 60000)) : 0, seconds: Math.round(ms / 1000) }
}

export const PACE_RANGE = { slow: 110, fast: 170 } // comfortable interview pace in words per minute
export const LONG_ANSWER_SECONDS = 150
