import { useEffect, useState } from 'react'
import { Headphones, Mic, RefreshCw, Volume2 } from 'lucide-react'
import { micLevel } from '../../lib/live/audio'
import { chooseDevice, listAudioDevices, routeOutput, type DeviceOption } from '../../lib/live/devices'
import { readPref, writePref } from '../../lib/prefs'

export type DeviceChoice = { micDeviceId: string; outputDeviceId: string }

/** Pick the microphone and output before the interview, with a live level meter to confirm you're heard. */
export function DeviceCheck({ onChange }: { onChange: (c: DeviceChoice) => void }) {
  const [inputs, setInputs] = useState<DeviceOption[]>([])
  const [outputs, setOutputs] = useState<DeviceOption[]>([])
  const [mic, setMic] = useState('')
  const [output, setOutput] = useState('')
  const [level, setLevel] = useState(0)
  const [error, setError] = useState('')

  const refresh = async () => {
    setError('')
    try {
      const { inputs, outputs } = await listAudioDevices()
      setInputs(inputs)
      setOutputs(outputs)
      setMic(chooseDevice(inputs, readPref('micDeviceId', '')))
      setOutput(chooseDevice(outputs, readPref('outputDeviceId', '')))
    } catch (err) {
      setError(
        `Microphone unavailable (${(err as Error).name}). Check Windows Settings → Privacy & security → Microphone → "Let desktop apps access your microphone", and that the headset is plugged in.`,
      )
    }
  }

  useEffect(() => {
    void refresh()
    // Re-list when a headset is plugged in or removed.
    const onChange = () => void refresh()
    navigator.mediaDevices.addEventListener('devicechange', onChange)
    return () => navigator.mediaDevices.removeEventListener('devicechange', onChange)
  }, [])

  useEffect(() => {
    onChange({ micDeviceId: mic, outputDeviceId: output })
    if (mic) writePref('micDeviceId', mic)
    if (output) writePref('outputDeviceId', output)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mic, output])

  // Live level meter for the chosen microphone.
  useEffect(() => {
    if (!mic) return
    let stopped = false
    let stream: MediaStream | undefined
    let ctx: AudioContext | undefined
    let raf = 0
    ;(async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: { deviceId: { exact: mic }, echoCancellation: true, noiseSuppression: true } })
        if (stopped) return stream.getTracks().forEach((t) => t.stop())
        ctx = new AudioContext()
        const analyser = ctx.createAnalyser()
        analyser.fftSize = 1024
        ctx.createMediaStreamSource(stream).connect(analyser)
        const buf = new Float32Array(analyser.fftSize)
        const tick = () => {
          analyser.getFloatTimeDomainData(buf)
          setLevel(micLevel(buf))
          raf = requestAnimationFrame(tick)
        }
        tick()
      } catch (err) {
        setError(`Couldn't open that microphone (${(err as Error).name}). Try another one, or replug the headset.`)
      }
    })()
    return () => {
      stopped = true
      cancelAnimationFrame(raf)
      stream?.getTracks().forEach((t) => t.stop())
      void ctx?.close().catch(() => {})
      setLevel(0)
    }
  }, [mic])

  const testOutput = async () => {
    const ctx = new AudioContext()
    await routeOutput(ctx, output).catch(() => {})
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0.15, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6)
    osc.frequency.value = 660
    osc.connect(gain).connect(ctx.destination)
    osc.start()
    osc.stop(ctx.currentTime + 0.6)
    osc.onended = () => void ctx.close()
  }

  return (
    <div className="w-full max-w-lg space-y-3 text-left">
      <label className="block space-y-1.5">
        <span className="label-mono flex items-center gap-1.5">
          <Mic size={12} /> Microphone
        </span>
        <div className="flex gap-2">
          <select className="field" value={mic} onChange={(e) => setMic(e.target.value)}>
            {inputs.map((d) => (
              <option key={d.deviceId} value={d.deviceId}>
                {d.label}
              </option>
            ))}
          </select>
          <button type="button" className="btn btn-ghost" onClick={refresh} title="Refresh device list" aria-label="Refresh device list">
            <RefreshCw size={15} />
          </button>
        </div>
      </label>
      <div>
        <div className="h-2.5 overflow-hidden rounded-full bg-white/5">
          <div
            className={`h-full rounded-full transition-[width] duration-75 ${level > 0.15 ? 'bg-success' : 'bg-ink-3'}`}
            style={{ width: `${Math.round(level * 100)}%` }}
          />
        </div>
        <p className="mt-1 font-mono text-[11px] text-ink-3">{level > 0.15 ? 'You’re coming through.' : 'Say something to test your microphone.'}</p>
      </div>
      <label className="block space-y-1.5">
        <span className="label-mono flex items-center gap-1.5">
          <Headphones size={12} /> Output
        </span>
        <div className="flex gap-2">
          <select className="field" value={output} onChange={(e) => setOutput(e.target.value)}>
            {outputs.map((d) => (
              <option key={d.deviceId} value={d.deviceId}>
                {d.label}
              </option>
            ))}
          </select>
          <button type="button" className="btn btn-ghost" onClick={testOutput} title="Play a test tone" aria-label="Play a test tone">
            <Volume2 size={15} />
          </button>
        </div>
      </label>
      {error && <p className="rounded-xl border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-rose-200">{error}</p>}
    </div>
  )
}
