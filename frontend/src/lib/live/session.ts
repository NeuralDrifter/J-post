// Runs one voice interview against the Gemini Live API: microphone capture,
// interviewer playback, recording, transcript, timekeeping and reconnection.
import type { main } from '../backend'
import { decodeModelAudio, encodeMicChunk, micLevel, OUTPUT_RATE } from './audio'
import { routeOutput } from './devices'
import { applyServerMessage, initialLiveState, type LiveEffect, type LiveState, type Line } from './reducer'

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
const CHUNK_SECONDS = 0.1
const PLAYBACK_CUSHION = 0.15 // seconds of buffer when speech (re)starts, absorbs network jitter
const decoder = new TextDecoder()

// Inline AudioWorklet: copies microphone frames to the main thread.
const WORKLET = `class MicCapture extends AudioWorkletProcessor {
  process(inputs) { const ch = inputs[0] && inputs[0][0]; if (ch) this.port.postMessage(ch.slice(0)); return true }
}
registerProcessor('mic-capture', MicCapture)`

export class InterviewSession {
  private ws?: WebSocket
  private ctx?: AudioContext
  private mic?: MediaStream
  private recDest?: MediaStreamAudioDestinationNode
  private recorder?: MediaRecorder
  private chunks: Blob[] = []
  private state: LiveState = initialLiveState()
  private sources = new Set<AudioBufferSourceNode>()
  private playHead = 0
  private pending: Float32Array[] = []
  private pendingLength = 0
  private t0 = 0
  private muted = false
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
    try {
      this.mic = await navigator.mediaDevices.getUserMedia({
        audio: {
          deviceId: this.config.micDeviceId ? { exact: this.config.micDeviceId } : undefined,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
        },
      })
    } catch (err) {
      throw new Error(
        `Microphone unavailable (${(err as Error).name}). Check Windows Settings → Privacy & security → Microphone → "Let desktop apps access your microphone".`,
      )
    }
    const ctx = new AudioContext()
    this.ctx = ctx
    await routeOutput(ctx, this.config.outputDeviceId ?? '').catch(() => {}) // fall back to the default output
    const workletUrl = URL.createObjectURL(new Blob([WORKLET], { type: 'application/javascript' }))
    await ctx.audioWorklet.addModule(workletUrl)
    URL.revokeObjectURL(workletUrl)

    const micSource = ctx.createMediaStreamSource(this.mic)
    const capture = new AudioWorkletNode(ctx, 'mic-capture')
    const silent = ctx.createGain()
    silent.gain.value = 0
    micSource.connect(capture).connect(silent).connect(ctx.destination)
    capture.port.onmessage = (e: MessageEvent<Float32Array>) => this.onMicFrames(e.data)

    // Recording mixes your microphone and the interviewer's voice.
    this.recDest = ctx.createMediaStreamDestination()
    micSource.connect(this.recDest)
    const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : ''
    this.recorder = new MediaRecorder(this.recDest.stream, mime ? { mimeType: mime } : undefined)
    this.recorder.ondataavailable = (e) => e.data.size > 0 && this.chunks.push(e.data)
    this.recorder.start(1000)

    this.t0 = performance.now()
    this.connect()
    this.scheduleTimekeeper()
  }

  setMuted(muted: boolean) {
    this.muted = muted
  }

  /** Stops everything and returns the transcript and recording. */
  async end(): Promise<{ lines: Line[]; recording: Blob | null }> {
    this.ended = true
    this.timers.forEach((t) => window.clearTimeout(t))
    this.ws?.close(1000, 'interview ended')
    this.stopPlayback()
    this.mic?.getTracks().forEach((t) => t.stop())
    const recording = await new Promise<Blob | null>((resolve) => {
      const rec = this.recorder
      if (!rec || rec.state === 'inactive') return resolve(this.chunks.length ? new Blob(this.chunks, { type: 'audio/webm' }) : null)
      rec.onstop = () => resolve(this.chunks.length ? new Blob(this.chunks, { type: 'audio/webm' }) : null)
      rec.stop()
    })
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
        this.play(e.data)
        break
      case 'interrupt':
        this.stopPlayback()
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

  private scheduleTimekeeper() {
    const { wrapUp, wrapUpAtMs, timeUp, timeUpAtMs } = this.config.cues
    this.timers.push(
      window.setTimeout(() => this.sendText(wrapUp, false), wrapUpAtMs),
      window.setTimeout(() => this.sendText(timeUp, false), timeUpAtMs),
    )
  }

  private onMicFrames(frames: Float32Array) {
    if (!this.ctx || this.muted || this.ws?.readyState !== WebSocket.OPEN) return
    this.pending.push(frames)
    this.pendingLength += frames.length
    if (this.pendingLength < this.ctx.sampleRate * CHUNK_SECONDS) return
    const joined = new Float32Array(this.pendingLength)
    let offset = 0
    for (const f of this.pending) {
      joined.set(f, offset)
      offset += f.length
    }
    this.pending = []
    this.pendingLength = 0
    this.cb.onMicLevel?.(micLevel(joined))
    const data = encodeMicChunk(joined, this.ctx.sampleRate)
    this.ws.send(JSON.stringify({ realtimeInput: { audio: { data, mimeType: 'audio/pcm;rate=16000' } } }))
  }

  private play(b64: string) {
    const ctx = this.ctx
    if (!ctx) return
    const samples = decodeModelAudio(b64)
    if (samples.length === 0) return
    const buffer = ctx.createBuffer(1, samples.length, OUTPUT_RATE)
    buffer.copyToChannel(samples, 0)
    const src = ctx.createBufferSource()
    src.buffer = buffer
    src.connect(ctx.destination)
    if (this.recDest) src.connect(this.recDest)
    // Back-to-back while speaking; a small cushion when the queue had run dry.
    const startAt = this.playHead > ctx.currentTime ? this.playHead : ctx.currentTime + PLAYBACK_CUSHION
    src.start(startAt)
    this.playHead = startAt + buffer.duration
    this.sources.add(src)
    this.cb.onSpeaking('interviewer')
    src.onended = () => {
      this.sources.delete(src)
      if (this.sources.size === 0) this.cb.onSpeaking(null)
    }
  }

  private stopPlayback() {
    this.sources.forEach((s) => {
      try {
        s.stop()
      } catch {
        // already stopped
      }
    })
    this.sources.clear()
    this.playHead = this.ctx?.currentTime ?? 0
    this.cb.onSpeaking(null)
  }
}
