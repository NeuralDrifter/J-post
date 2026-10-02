// Microphone / output device selection. Headsets (e.g. SteelSeries "Game" vs
// "Chat") often aren't the Windows default, so the user picks explicitly.

export type DeviceOption = { deviceId: string; label: string }

/** The remembered device if it's still connected, else the system default (or first). */
export function chooseDevice(devices: DeviceOption[], savedId: string): string {
  if (devices.length === 0) return ''
  if (savedId && devices.some((d) => d.deviceId === savedId)) return savedId
  return devices.find((d) => d.deviceId === 'default')?.deviceId ?? devices[0].deviceId
}

/** Lists audio inputs and outputs. Asks for mic access first, because device labels are hidden until then. */
export async function listAudioDevices(): Promise<{ inputs: DeviceOption[]; outputs: DeviceOption[] }> {
  const probe = await navigator.mediaDevices.getUserMedia({ audio: true })
  probe.getTracks().forEach((t) => t.stop())
  const all = await navigator.mediaDevices.enumerateDevices()
  const pick = (kind: MediaDeviceKind, fallback: string) =>
    all
      .filter((d) => d.kind === kind)
      .map((d, i) => ({ deviceId: d.deviceId, label: d.label || `${fallback} ${i + 1}` }))
  return { inputs: pick('audioinput', 'Microphone'), outputs: pick('audiooutput', 'Speakers') }
}

/** Chromium can route an AudioContext to a chosen output device. */
export async function routeOutput(ctx: AudioContext, deviceId: string): Promise<void> {
  const withSink = ctx as AudioContext & { setSinkId?: (id: string) => Promise<void> }
  if (deviceId && deviceId !== 'default' && withSink.setSinkId) await withSink.setSinkId(deviceId)
}
