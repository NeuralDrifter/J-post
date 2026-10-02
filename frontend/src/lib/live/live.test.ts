import { describe, expect, it } from 'vitest'
import { base64ToBytes, bytesToBase64, downsample, floatToPCM16, micLevel, pcm16ToFloat } from './audio'
import { chooseDevice } from './devices'
import { answerStats, countFillers, wordCount } from './metrics'
import { applyServerMessage, initialLiveState, type LiveState } from './reducer'

describe('audio', () => {
  it('downsamples 48 kHz to 16 kHz by averaging', () => {
    const input = new Float32Array(48).map((_, i) => i % 3) // 0,1,2,0,1,2…
    const out = downsample(input, 48000, 16000)
    expect(out.length).toBe(16)
    expect(out.every((v) => Math.abs(v - 1) < 1e-6)).toBe(true)
  })

  it('round-trips float ↔ PCM16 and clamps', () => {
    const pcm = floatToPCM16(new Float32Array([0, 0.5, -0.5, 1.5, -2]))
    expect(Array.from(pcm)).toEqual([0, 16383, -16384, 32767, -32768])
    const back = pcm16ToFloat(pcm)
    expect(back[1]).toBeCloseTo(0.5, 3)
  })

  it('round-trips bytes through base64', () => {
    const bytes = new Uint8Array([0, 1, 254, 255, 128])
    expect(Array.from(base64ToBytes(bytesToBase64(bytes)))).toEqual([0, 1, 254, 255, 128])
  })
})

describe('metrics', () => {
  it('counts words and filler words', () => {
    expect(wordCount("  So I, um, basically   led the team. ")).toBe(7)
    expect(countFillers('Um, I mean, like, it was, you know, kind of hard. Uh, basically yes. I likes it.')).toBe(7)
  })

  it('computes speaking pace', () => {
    const s = answerStats('one two three four five six seven eight nine ten', 1000, 5000)
    expect(s.words).toBe(10)
    expect(s.wpm).toBe(150)
    expect(answerStats('hi', 1000, 1000).wpm).toBe(0)
  })
})

function run(messages: object[], start: LiveState = initialLiveState()) {
  let state = start
  const effects: ReturnType<typeof applyServerMessage>['effects'] = []
  messages.forEach((m, i) => {
    const r = applyServerMessage(state, m, i * 1000)
    state = r.state
    effects.push(...r.effects)
  })
  return { state, effects }
}

describe('live reducer', () => {
  it('merges transcription fragments into one line per turn', () => {
    const { state } = run([
      { serverContent: { outputTranscription: { text: 'Hi, I am' } } },
      { serverContent: { outputTranscription: { text: ' Dana. Tell me' } } },
      { serverContent: { outputTranscription: { text: ' about yourself.' } } },
      { serverContent: { inputTranscription: { text: 'Sure, I' } } },
      { serverContent: { inputTranscription: { text: ' build payment systems.' } } },
    ])
    expect(state.lines).toEqual([
      { speaker: 'interviewer', text: 'Hi, I am Dana. Tell me about yourself.', atMs: 0 },
      { speaker: 'you', text: 'Sure, I build payment systems.', atMs: 3000 },
    ])
  })

  it('reports an ended answer when the interviewer speaks again', () => {
    const answer = 'I led a migration of our billing system to a new provider over six months.'
    const { effects } = run([
      { serverContent: { outputTranscription: { text: 'What did you lead?' } } },
      { serverContent: { inputTranscription: { text: answer } } },
      { serverContent: { outputTranscription: { text: 'Interesting.' } } },
    ])
    expect(effects).toContainEqual({ type: 'answerEnded', question: 'What did you lead?', answer, startMs: 1000, endMs: 1000 })
  })

  it('does not report very short answers', () => {
    const { effects } = run([
      { serverContent: { outputTranscription: { text: 'Ready?' } } },
      { serverContent: { inputTranscription: { text: 'Yes.' } } },
      { serverContent: { outputTranscription: { text: 'Great.' } } },
    ])
    expect(effects.some((e) => e.type === 'answerEnded')).toBe(false)
  })

  it('plays audio and clears playback when interrupted', () => {
    const { effects } = run([
      { serverContent: { modelTurn: { parts: [{ inlineData: { mimeType: 'audio/pcm;rate=24000', data: 'AAA=' } }] } } },
      { serverContent: { interrupted: true } },
    ])
    expect(effects).toEqual([{ type: 'audio', data: 'AAA=' }, { type: 'interrupt' }])
  })

  it('keeps the resumption handle and asks to reconnect on goAway', () => {
    const { state, effects } = run([
      { setupComplete: {} },
      { sessionResumptionUpdate: { newHandle: 'h1', resumable: true } },
      { sessionResumptionUpdate: { newHandle: 'h2', resumable: false } },
      { goAway: { timeLeft: '50s' } },
    ])
    expect(state.handle).toBe('h1')
    expect(effects).toEqual([{ type: 'setupComplete' }, { type: 'reconnect' }])
  })
})


describe('mic level', () => {
  it('is 0 for silence and grows with loudness, capped at 1', () => {
    expect(micLevel(new Float32Array(128))).toBe(0)
    const quiet = micLevel(new Float32Array(128).fill(0.02))
    const loud = micLevel(new Float32Array(128).fill(0.3))
    expect(quiet).toBeGreaterThan(0)
    expect(loud).toBeGreaterThan(quiet)
    expect(micLevel(new Float32Array(128).fill(1))).toBe(1)
  })
})

describe('chooseDevice', () => {
  const devices = [
    { deviceId: 'default', label: 'Default - Realtek' },
    { deviceId: 'abc', label: 'Arctis Nova Pro Microphone' },
  ]
  it('keeps the remembered device when it is still plugged in', () => {
    expect(chooseDevice(devices, 'abc')).toBe('abc')
  })
  it('falls back to the system default when the remembered one is gone', () => {
    expect(chooseDevice(devices, 'unplugged')).toBe('default')
    expect(chooseDevice([], 'abc')).toBe('')
  })
})
