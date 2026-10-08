// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

import { useEffect, useRef, useState } from 'react'
import { Dices, LoaderCircle, Play, Square } from 'lucide-react'
import { api } from '../../lib/api'
import { ListVoices, VoicePreview, type app } from '../../lib/backend'
import { useLoad } from '../../lib/useLoad'

type GenderFilter = 'all' | 'female' | 'male'

/**
 * Interviewer voice: "Surprise me" (a random stranger's voice, the default) or any of the
 * prebuilt voices, each with a play button (samples are generated once, then cached).
 */
export function VoicePicker({ value, onChange }: { value: string; onChange: (voice: string) => void }) {
  const { data: voices } = useLoad(() => api(ListVoices()), [])
  const [filter, setFilter] = useState<GenderFilter>('all')
  const [playing, setPlaying] = useState<string | null>(null)
  const [loading, setLoading] = useState<string | null>(null)
  const audio = useRef<HTMLAudioElement | null>(null)

  useEffect(() => {
    return () => audio.current?.pause()
  }, [])

  const preview = async (voice: string) => {
    audio.current?.pause()
    if (playing === voice) {
      setPlaying(null)
      return
    }
    setLoading(voice)
    const url = await api(VoicePreview(voice))
    setLoading(null)
    if (!url) return
    const el = new Audio(url)
    audio.current = el
    el.onended = () => setPlaying(null)
    setPlaying(voice)
    void el.play().catch(() => setPlaying(null))
  }

  const shown = (voices ?? []).filter((v: app.VoiceOption) => filter === 'all' || v.gender === filter)

  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <button
          type="button"
          onClick={() => onChange('')}
          className={`flex flex-1 items-center gap-2 rounded-xl border px-3 py-2 text-left transition ${
            value === '' ? 'border-accent/60 bg-accent/15' : 'border-line hover:border-line-strong'
          }`}
        >
          <Dices size={18} className="shrink-0 text-indigo-200" />
          <span>
            <span className="block text-sm font-semibold">Surprise me</span>
            <span className="block text-[11px] text-ink-3">A random voice and name, like meeting a real stranger</span>
          </span>
        </button>
        <div className="flex rounded-lg border border-line bg-white/5 p-0.5 text-xs">
          {(['all', 'female', 'male'] as const).map((g) => (
            <button
              key={g}
              type="button"
              onClick={() => setFilter(g)}
              className={`rounded-md px-2 py-1 font-semibold capitalize ${filter === g ? 'bg-accent/30 text-ink' : 'text-ink-2 hover:text-ink'}`}
            >
              {g}
            </button>
          ))}
        </div>
      </div>
      <div className="grid max-h-52 grid-cols-2 gap-1.5 overflow-y-auto rounded-xl border border-line p-1.5 min-[700px]:grid-cols-3">
        {shown.map((v: app.VoiceOption) => {
          const selected = v.name === value
          return (
            <div
              key={v.name}
              className={`flex items-center gap-1.5 rounded-lg border px-2 py-1.5 transition ${
                selected ? 'border-accent/60 bg-accent/15' : 'border-transparent hover:bg-white/5'
              }`}
            >
              <button type="button" className="min-w-0 flex-1 text-left" onClick={() => onChange(v.name)}>
                <span className="block truncate text-sm font-semibold">{v.name}</span>
                <span className="block text-[11px] text-ink-3">
                  {v.style} · {v.gender === 'female' ? 'Female' : 'Male'}
                </span>
              </button>
              <button
                type="button"
                onClick={() => preview(v.name)}
                className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-ink-2 hover:bg-white/10 hover:text-ink"
                title={`Preview ${v.name}`}
                aria-label={`Preview ${v.name}`}
              >
                {loading === v.name ? <LoaderCircle size={13} className="animate-spin" /> : playing === v.name ? <Square size={11} /> : <Play size={13} />}
              </button>
            </div>
          )
        })}
      </div>
      <p className="mt-1 text-[11px] text-ink-3">The first preview of each voice takes a few seconds; after that it plays instantly.</p>
    </div>
  )
}
