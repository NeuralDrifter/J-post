// Runs one voice interview against the Gemini Live API. This class owns the
// connection (setup, reconnection, timekeeping) and wires together the
// microphone (mic.ts), the interviewer's voice (playback.ts) and the recording
// (recorder.ts).
import type { main } from '../backend'
import type { AudioChunk } from './audio'
import { routeOutput } from './devices'
import { MicCapture, openMicrophone } from './mic'
import { Playback } from './playback'
import { applyServerMessage, initialLiveState, type LiveEffect, type LiveState, type Line } from './reducer'
import { SessionRecorder } from './recorder'

export type SessionStatus = 'connecting' | 'live' | 'reconnecting' | 'ended' | 'error'

export type LiveConfig = {
  token: string
  wsUrl: string
  setup: Record<string, unknown>
  /** What to tell the interviewer, and when (written by the backend next to the brief). */
  cues: main.LiveCues
  micDeviceId?: string
  outputDeviceId?: string
}

export type SessionCallbacks = {
  onLines: (lines: Line[]) => void
  onStatus: (status: SessionStatus, detail?: string) => void
  onAnswerEnded: (e: Extract<LiveEffect, { type: 'answerEnded' }>) => void
  onSpeaking: (who: 'interviewer' | 'you' | null) => void
  onMicLevel?: (level: number) => void
}

const MAX_RECONNECTS = 3
const decoder = new TextDecoder()

export class InterviewSession {
  private ws?: WebSocket
  private ctx?: AudioContext
  private mic?: MicCapture
  private playback?: Playback
  private recorder?: SessionRecorder
  private state: LiveState = initialLiveState()
  private t0 = 0
  private ended = false
  private started = false
  private reconnects = 0
  private timers: number[] = []

  constructor(
    private config: LiveConfig,
    private cb: SessionCallbacks,
  ) {}

  get isEnded(): boolean {
    return this.ended
  }

  get lines(): Line[] {
    return this.state.lines
  }

  /** Milliseconds since the session (and recording) started. */
  now(): number {
    return performance.now() - this.t0
  }

  async start(): Promise<void> {
    this.cb.onStatus('connecting')
    const stream = await openMicrophone(this.config.micDeviceId)
    const ctx = new AudioContext()
    this.ctx = ctx
    await routeOutput(ctx, this.config.outputDeviceId ?? '').catch(() => {}) // fall back to the default output
    this.mic = await MicCapture.attach(ctx, stream, {
      accepting: () => this.ws?.readyState === WebSocket.OPEN,
      onChunk: (chunk, level) => this.sendAudio(chunk, level),
    })

    // The recording mixes your microphone and the interviewer's voice.
    this.recorder = new SessionRecorder(ctx)
    this.mic.source.connect(this.recorder.input)
    this.playback = new Playback(ctx, [ctx.destination, this.recorder.input], (speaking) =>
      this.cb.onSpeaking(speaking ? 'interviewer' : null),
    )
    this.recorder.start()

    this.t0 = performance.now()
    this.connect()
    this.scheduleTimekeeper()
  }

  setMuted(muted: boolean) {
    if (this.mic) this.mic.muted = muted
  }

  /** Stops everything and returns the transcript and recording. */
  async end(): Promise<{ lines: Line[]; recording: Blob | null }> {
    this.ended = true
    this.timers.forEach((t) => window.clearTimeout(t))
    this.ws?.close(1000, 'interview ended')
    this.playback?.stop()
    this.mic?.stop()
    const recording = (await this.recorder?.stop()) ?? null
    await this.ctx?.close().catch(() => {})
    this.cb.onStatus('ended')
    return { lines: this.state.lines, recording }
  }

  private connect() {
    const ws = new WebSocket(`${this.config.wsUrl}?access_token=${encodeURIComponent(this.config.token)}`)
    // ArrayBuffer frames decode synchronously, so messages (and audio chunks) are
    // handled strictly in arrival order. Async Blob.text() could reorder them.
    ws.binaryType = 'arraybuffer'
    this.ws = ws
    ws.onopen = () => {
      const resumption = this.state.handle ? { handle: this.state.handle } : {}
      ws.send(JSON.stringify({ setup: { ...this.config.setup, sessionResumption: resumption } }))
    }
    ws.onmessage = (ev) => {
      const text = typeof ev.data === 'string' ? ev.data : decoder.decode(ev.data as ArrayBuffer)
      let msg: unknown
      try {
        msg = JSON.parse(text)
      } catch {
        return
      }
      const { state, effects } = applyServerMessage(this.state, msg, this.now())
      const linesChanged = state.lines !== this.state.lines
      this.state = state
      if (linesChanged) this.cb.onLines(state.lines)
      for (const e of effects) {
        try {
          this.handle(e)
        } catch (err) {
          console.error('live session effect failed', e.type, err)
        }
      }
    }
    ws.onclose = (ev) => {
      if (this.ws !== ws || this.ended) return
      if (this.state.handle && this.reconnects < MAX_RECONNECTS) {
        this.reconnect()
      } else {
        this.cb.onStatus('error', `Connection closed${ev.reason ? `: ${ev.reason}` : ` (code ${ev.code})`}`)
      }
    }
  }

  private reconnect() {
    this.reconnects++
    this.cb.onStatus('reconnecting')
    const old = this.ws
    this.ws = undefined
    if (old) {
      old.onclose = null
      old.onmessage = null
      old.close()
    }
    this.connect()
  }

  private handle(e: LiveEffect) {
    switch (e.type) {
      case 'setupComplete':
        this.reconnects = 0
        this.cb.onStatus('live')
        if (!this.started) {
          this.started = true
          this.sendText(this.config.cues.start, true)
        }
        break
      case 'audio':
        this.playback?.play(e.data)
        break
      case 'interrupt':
        this.playback?.stop()
        break
      case 'reconnect':
        if (this.state.handle) this.reconnect()
        break
      case 'answerEnded':
        this.cb.onAnswerEnded(e)
        break
    }
  }

  private sendText(text: string, turnComplete: boolean) {
    if (this.ws?.readyState !== WebSocket.OPEN) return
    this.ws.send(JSON.stringify({ clientContent: { turns: [{ role: 'user', parts: [{ text }] }], turnComplete } }))
  }

  private sendAudio(chunk: AudioChunk, level: number) {
    this.cb.onMicLevel?.(level)
    this.ws?.send(JSON.stringify({ realtimeInput: { audio: chunk } }))
  }

  private scheduleTimekeeper() {
    const { wrapUp, wrapUpAtMs, timeUp, timeUpAtMs } = this.config.cues
    this.timers.push(
      window.setTimeout(() => this.sendText(wrapUp, false), wrapUpAtMs),
      window.setTimeout(() => this.sendText(timeUp, false), timeUpAtMs),
    )
  }
}
