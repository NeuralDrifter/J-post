// Plays the interviewer's audio chunks back to back, and cuts it off when the
// candidate interrupts.
import { decodeModelAudio, OUTPUT_RATE } from './audio'

const PLAYBACK_CUSHION = 0.15 // seconds of buffer when speech (re)starts, absorbs network jitter

export class Playback {
  private sources = new Set<AudioBufferSourceNode>()
  private playHead = 0

  constructor(
    private ctx: AudioContext,
    /** Where the audio goes: the speakers, plus the recording. */
    private outputs: AudioNode[],
    private onSpeaking: (speaking: boolean) => void,
  ) {}

  /** Queues one chunk of base64 PCM16 right after whatever is already playing. */
  play(b64: string) {
    const samples = decodeModelAudio(b64)
    if (samples.length === 0) return
    const buffer = this.ctx.createBuffer(1, samples.length, OUTPUT_RATE)
    buffer.copyToChannel(samples, 0)
    const src = this.ctx.createBufferSource()
    src.buffer = buffer
    this.outputs.forEach((out) => src.connect(out))
    // Back-to-back while speaking; a small cushion when the queue had run dry.
    const now = this.ctx.currentTime
    const startAt = this.playHead > now ? this.playHead : now + PLAYBACK_CUSHION
    src.start(startAt)
    this.playHead = startAt + buffer.duration
    this.sources.add(src)
    this.onSpeaking(true)
    src.onended = () => {
      this.sources.delete(src)
      if (this.sources.size === 0) this.onSpeaking(false)
    }
  }

  stop() {
    this.sources.forEach((s) => {
      try {
        s.stop()
      } catch {
        // already stopped
      }
    })
    this.sources.clear()
    this.playHead = this.ctx.currentTime
    this.onSpeaking(false)
  }
}
