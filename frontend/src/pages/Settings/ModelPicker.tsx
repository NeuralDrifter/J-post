import { useState } from 'react'
import { LoaderCircle } from 'lucide-react'
import { api } from '../../lib/api'
import { ListAIModels, TestAIProvider, type main } from '../../lib/backend'
import { toast } from '../../lib/toast'
import { formatTestResult, modelChoices } from './modelChoices'

const OTHER = '__other__'

type PickerProps = { providerId: string; settings: main.Settings; value: string; onChange: (model: string) => void }

/** A model name box with a "Load models" button that swaps it for a dropdown of what the server offers. */
export function ModelPicker({ providerId, settings, value, onChange }: PickerProps) {
  const [models, setModels] = useState<string[] | null>(null)
  const [loading, setLoading] = useState(false)

  const load = async () => {
    setLoading(true)
    const list = await api(ListAIModels(providerId, settings))
    setLoading(false)
    if (list) setModels(list)
  }

  return (
    <div className="flex gap-2">
      {models ? (
        <select
          className="field font-mono text-xs"
          value={value}
          onChange={(e) => (e.target.value === OTHER ? setModels(null) : onChange(e.target.value))}
          aria-label="Model"
        >
          {!value && <option value="">Choose a model</option>}
          {modelChoices(models, value).map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
          <option value={OTHER}>Other…</option>
        </select>
      ) : (
        <input className="field font-mono text-xs" value={value} onChange={(e) => onChange(e.target.value)} placeholder="Model name" aria-label="Model" />
      )}
      <button type="button" className="btn btn-ghost min-w-28" onClick={load} disabled={loading}>
        {loading ? <LoaderCircle size={15} className="animate-spin" /> : 'Load models'}
      </button>
    </div>
  )
}

/** Runs a tiny task on the provider with the settings as entered and reports who answered and how fast. */
export function TestProviderButton({ providerId, label, settings }: { providerId: string; label: string; settings: main.Settings }) {
  const [testing, setTesting] = useState(false)
  const test = async () => {
    setTesting(true)
    const result = await api(TestAIProvider(providerId, settings))
    setTesting(false)
    if (result) toast.success(formatTestResult(label, result))
  }
  return (
    <button type="button" className="btn btn-ghost col-span-2 justify-self-start" onClick={test} disabled={testing}>
      {testing ? <LoaderCircle size={15} className="animate-spin" /> : `Test ${label}`}
    </button>
  )
}
