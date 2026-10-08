// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

// Pure handling of Gemini Live server messages: builds the transcript and tells
// the session what to do (play audio, stop playback, reconnect, nudge).

export type Speaker = 'interviewer' | 'you'

/**
 * Facts about an interviewer line the candidate's speech cut off, so scoring can
 * tell a real interruption from the interviewer jumping into a thinking pause.
 */
export type CutOff = {
  spokeMs: number // how long the interviewer had been talking
  gapMs: number // silence between the candidate's previous words and the interviewer starting; -1 if none
}

export type Line = { speaker: Speaker; text: string; atMs: number; cutOff?: CutOff }

export type LiveState = {
  lines: Line[]
  handle?: string // latest resumable session handle
  youLastMs: number // when the current answer's last words arrived
}

export type LiveEffect =
  | { type: 'audio'; data: string }
  | { type: 'interrupt' }
  | { type: 'setupComplete' }
  | { type: 'reconnect' }
  | { type: 'answerEnded'; question: string; answer: string; startMs: number; endMs: number }

const MIN_NUDGE_WORDS = 8

export function initialLiveState(): LiveState {
  return { lines: [], youLastMs: 0 }
}

type ServerMessage = {
  setupComplete?: object
  goAway?: object
  sessionResumptionUpdate?: { newHandle?: string; resumable?: boolean }
  serverContent?: {
    modelTurn?: { parts?: { inlineData?: { mimeType?: string; data?: string } }[] }
    interrupted?: boolean
    inputTranscription?: { text?: string }
    outputTranscription?: { text?: string }
  }
}

function appendText(lines: Line[], speaker: Speaker, fragment: string, atMs: number): Line[] {
  const last = lines[lines.length - 1]
  if (last && last.speaker === speaker) {
    return [...lines.slice(0, -1), { ...last, text: (last.text + fragment).replace(/\s+/g, ' ') }]
  }
  return [...lines, { speaker, text: fragment.replace(/\s+/g, ' ').trimStart(), atMs }]
}

// Called before the interrupting words are added, so youLastMs is still the end
// of the candidate's previous answer.
function markCutOff(state: LiveState, atMs: number): Line[] {
  const lines = state.lines
  const last = lines[lines.length - 1]
  if (last?.speaker !== 'interviewer') return lines
  const followedCandidate = lines[lines.length - 2]?.speaker === 'you'
  const cutOff = { spokeMs: atMs - last.atMs, gapMs: followedCandidate ? last.atMs - state.youLastMs : -1 }
  return [...lines.slice(0, -1), { ...last, cutOff }]
}

/** The conversation so far, for seeding a fresh session after a dropped call. */
export function rejoinPrompt(note: string, lines: Line[]): string {
  const history = lines.map((l) => `${l.speaker === 'you' ? 'Candidate' : 'Interviewer'}: ${l.text}`).join('\n')
  return `${note}\n\n${history}`
}

export function applyServerMessage(state: LiveState, raw: unknown, atMs: number): { state: LiveState; effects: LiveEffect[] } {
  const msg = raw as ServerMessage
  const effects: LiveEffect[] = []
  let next = state

  if (msg.setupComplete) effects.push({ type: 'setupComplete' })
  const update = msg.sessionResumptionUpdate
  if (update?.resumable && update.newHandle) next = { ...next, handle: update.newHandle }
  if (msg.goAway) effects.push({ type: 'reconnect' })

  const content = msg.serverContent
  if (content) {
    for (const part of content.modelTurn?.parts ?? []) {
      if (part.inlineData?.data && (part.inlineData.mimeType ?? 'audio/pcm').startsWith('audio/')) {
        effects.push({ type: 'audio', data: part.inlineData.data })
      }
    }
    if (content.interrupted) {
      effects.push({ type: 'interrupt' })
      next = { ...next, lines: markCutOff(next, atMs) }
    }

    const heard = content.inputTranscription?.text
    if (heard) {
      next = { ...next, lines: appendText(next.lines, 'you', heard, atMs), youLastMs: atMs }
    }
    const said = content.outputTranscription?.text
    if (said) {
      const last = next.lines[next.lines.length - 1]
      if (last?.speaker === 'you') {
        // The interviewer is talking again, so the candidate's answer has ended.
        const question = [...next.lines].reverse().find((l) => l.speaker === 'interviewer')?.text ?? ''
        if (last.text.trim().split(/\s+/).length >= MIN_NUDGE_WORDS) {
          effects.push({ type: 'answerEnded', question, answer: last.text.trim(), startMs: last.atMs, endMs: next.youLastMs })
        }
      }
      next = { ...next, lines: appendText(next.lines, 'interviewer', said, atMs) }
    }
  }
  return { state: next, effects }
}
