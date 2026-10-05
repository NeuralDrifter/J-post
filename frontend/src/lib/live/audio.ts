// PCM helpers for the Gemini Live API: microphone in as 16 kHz PCM16,
// interviewer audio out as 24 kHz PCM16, both base64 on the wire.

export const INPUT_RATE = 16000
export const OUTPUT_RATE = 24000

/** Downsample by averaging each output sample's source window (simple low-pass). */
export function downsample(input: Float32Array, inRate: number, outRate: number): Float32Array {
  if (outRate >= inRate) return input
  const ratio = inRate / outRate
  const out = new Float32Array(Math.floor(input.length / ratio))
  for (let i = 0; i < out.length; i++) {
    const start = Math.floor(i * ratio)
    const end = Math.min(input.length, Math.floor((i + 1) * ratio))
    let sum = 0
    for (let j = start; j < end; j++) sum += input[j]
    out[i] = sum / Math.max(1, end - start)
  }
  return out
}

export function floatToPCM16(input: Float32Array): Int16Array {
  const out = new Int16Array(input.length)
  for (let i = 0; i < input.length; i++) {
    const s = Math.max(-1, Math.min(1, input[i]))
    out[i] = (s < 0 ? s * 0x8000 : s * 0x7fff) | 0
  }
  return out
}

export function pcm16ToFloat(input: Int16Array): Float32Array<ArrayBuffer> {
  const out = new Float32Array(input.length)
  for (let i = 0; i < input.length; i++) out[i] = input[i] / (input[i] < 0 ? 0x8000 : 0x7fff)
  return out
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  return btoa(binary)
}

export function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64)
  const out = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i)
  return out
}

/** Audio as the Live API's realtimeInput expects it. */
export type AudioChunk = { data: string; mimeType: string }

export const INPUT_MIME = `audio/pcm;rate=${INPUT_RATE}`

/** Microphone frames (any rate) → base64 PCM16 at INPUT_RATE, labelled with that format. */
export function encodeMicChunk(frames: Float32Array, inRate: number): AudioChunk {
  const pcm = floatToPCM16(downsample(frames, inRate, INPUT_RATE))
  return { data: bytesToBase64(new Uint8Array(pcm.buffer)), mimeType: INPUT_MIME }
}

/** Interviewer audio (base64 PCM16 little-endian) → Float32 samples. */
export function decodeModelAudio(b64: string): Float32Array<ArrayBuffer> {
  const bytes = base64ToBytes(b64)
  return pcm16ToFloat(new Int16Array(bytes.buffer, bytes.byteOffset, Math.floor(bytes.byteLength / 2)))
}

/** 0..1 loudness for a level meter (square root of RMS, so quiet speech still shows). */
export function micLevel(frames: Float32Array): number {
  if (frames.length === 0) return 0
  let sum = 0
  for (let i = 0; i < frames.length; i++) sum += frames[i] * frames[i]
  return Math.min(1, Math.sqrt(Math.sqrt(sum / frames.length)) * 1.4)
}
