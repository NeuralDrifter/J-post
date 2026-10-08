// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

// Records a live session (the microphone plus the interviewer) as webm/opus.

const PREFERRED_MIME = 'audio/webm;codecs=opus'
const TIMESLICE_MS = 1000

export class SessionRecorder {
  /** Connect anything that should be in the recording to this node. */
  readonly input: MediaStreamAudioDestinationNode
  private recorder: MediaRecorder
  private chunks: Blob[] = []

  constructor(ctx: AudioContext) {
    this.input = ctx.createMediaStreamDestination()
    const mime = MediaRecorder.isTypeSupported(PREFERRED_MIME) ? PREFERRED_MIME : ''
    this.recorder = new MediaRecorder(this.input.stream, mime ? { mimeType: mime } : undefined)
    this.recorder.ondataavailable = (e) => {
      if (e.data.size > 0) this.chunks.push(e.data)
    }
  }

  start() {
    this.recorder.start(TIMESLICE_MS)
  }

  /** Stops recording and returns it, or null when nothing was captured. */
  stop(): Promise<Blob | null> {
    return new Promise((resolve) => {
      const finish = () => resolve(this.chunks.length ? new Blob(this.chunks, { type: 'audio/webm' }) : null)
      if (this.recorder.state === 'inactive') return finish()
      this.recorder.onstop = finish
      this.recorder.stop()
    })
  }
}
