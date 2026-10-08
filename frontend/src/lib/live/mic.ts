// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

// Microphone capture for a live session: 100 ms chunks of 16 kHz PCM16, plus a
// loudness reading for the level meter.
import { encodeMicChunk, micLevel, type AudioChunk } from './audio'

const CHUNK_SECONDS = 0.1

// Inline AudioWorklet: copies microphone frames to the main thread.
const WORKLET = `class MicCapture extends AudioWorkletProcessor {
  process(inputs) { const ch = inputs[0] && inputs[0][0]; if (ch) this.port.postMessage(ch.slice(0)); return true }
}
registerProcessor('mic-capture', MicCapture)`

/** Opens the microphone (a specific device when deviceId is set), with an actionable error if it's blocked. */
export async function openMicrophone(deviceId: string | undefined): Promise<MediaStream> {
  try {
    return await navigator.mediaDevices.getUserMedia({
      audio: {
        deviceId: deviceId ? { exact: deviceId } : undefined,
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
}

export type MicHandlers = {
  /** While this returns false (e.g. disconnected), frames are dropped rather than buffered. */
  accepting: () => boolean
  onChunk: (chunk: AudioChunk, level: number) => void
}

export class MicCapture {
  muted = false
  private pending: Float32Array[] = []
  private pendingLength = 0

  private constructor(
    private ctx: AudioContext,
    private stream: MediaStream,
    /** The microphone as an audio node, e.g. to feed the recording. */
    readonly source: MediaStreamAudioSourceNode,
    private handlers: MicHandlers,
  ) {}

  /** Starts capturing an already-open microphone stream through ctx. */
  static async attach(ctx: AudioContext, stream: MediaStream, handlers: MicHandlers): Promise<MicCapture> {
    const workletUrl = URL.createObjectURL(new Blob([WORKLET], { type: 'application/javascript' }))
    await ctx.audioWorklet.addModule(workletUrl)
    URL.revokeObjectURL(workletUrl)

    const source = ctx.createMediaStreamSource(stream)
    const capture = new AudioWorkletNode(ctx, 'mic-capture')
    const silent = ctx.createGain() // the worklet must reach the destination to run; keep it inaudible
    silent.gain.value = 0
    source.connect(capture).connect(silent).connect(ctx.destination)

    const mic = new MicCapture(ctx, stream, source, handlers)
    capture.port.onmessage = (e: MessageEvent<Float32Array>) => mic.onFrames(e.data)
    return mic
  }

  stop() {
    this.stream.getTracks().forEach((t) => t.stop())
  }

  private onFrames(frames: Float32Array) {
    if (this.muted || !this.handlers.accepting()) return
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
    this.handlers.onChunk(encodeMicChunk(joined, this.ctx.sampleRate), micLevel(joined))
  }
}
