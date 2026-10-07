import { useState } from 'react'
import { ExternalLink, LoaderCircle } from 'lucide-react'
import { Field } from '../../components/JobForm'
import { api } from '../../lib/api'
import { BrowserOpenURL, ListAIProviders, TestClaudeCode, type main } from '../../lib/backend'
import { toast } from '../../lib/toast'
import { useLoad } from '../../lib/useLoad'
import { Section } from './Section'

const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'] as const

type Props = { s: main.Settings; setS: (s: main.Settings) => void }

/** Who grades interviews and gives coaching tips, and how each provider is set up. */
export function AIProvidersSection({ s, setS }: Props) {
  // Readiness reflects saved settings; it refreshes after Save.
  const { data: providers } = useLoad(() => api(ListAIProviders()), [])
  const [testing, setTesting] = useState(false)

  const testClaudeCode = async () => {
    setTesting(true)
    const version = await api(TestClaudeCode(s.claudeCodePath))
    setTesting(false)
    if (version) toast.success(`Claude Code is ready (${version})`)
  }

  const providerSelect = (value: string, onChange: (id: string) => void, label: string) => (
    <select className="field" value={value} onChange={(e) => onChange(e.target.value)} aria-label={label}>
      {(providers ?? []).map((p) => (
        <option key={p.id} value={p.id}>
          {p.label}
          {p.unavailable ? ' (setup needed)' : ''}
        </option>
      ))}
    </select>
  )

  return (
    <Section title="AI providers" hint="Choose who grades your mock interviews and who gives coaching tips during them. Set each provider up below.">
      <div className="grid grid-cols-2 gap-4">
        <Field label="Grading">{providerSelect(s.gradingProvider, (id) => setS({ ...s, gradingProvider: id }), 'Grading provider')}</Field>
        <Field label="Coaching tips">{providerSelect(s.tipsProvider, (id) => setS({ ...s, tipsProvider: id }), 'Coaching tips provider')}</Field>
      </div>
      <p className="mt-2 text-[11px] text-ink-3">
        Recommended for tips: Gemini Live — it answers in about a second. Claude Code takes several seconds just to start. Any interview can also be
        re-graded with another provider from its review page.
      </p>

      <ProviderBlock title="Gemini Live" note="Runs the interview itself, so it's always needed for the voice.">
        <Field label="Gemini API key" wide>
          <input className="field" type="password" autoComplete="off" value={s.geminiKey} onChange={(e) => setS({ ...s, geminiKey: e.target.value })} />
        </Field>
        <Field label="Live model" wide>
          <input className="field font-mono text-xs" value={s.geminiLiveModel} onChange={(e) => setS({ ...s, geminiLiveModel: e.target.value })} />
        </Field>
        <LinkButton url="https://aistudio.google.com/apikey">Get a Gemini API key</LinkButton>
        <p className="col-span-2 rounded-xl border border-warn/30 bg-warn/5 px-3 py-2 text-[11px] leading-relaxed text-amber-200/90">
          Privacy: on Google's free tier, what you send (your resume, interview audio and transcripts) may be used by Google to improve its products. The paid
          tier doesn't.
        </p>
      </ProviderBlock>

      <ProviderBlock title="Anthropic API" note="Pay-as-you-go with your own API key.">
        <Field label="Anthropic API key" wide>
          <input className="field" type="password" autoComplete="off" value={s.anthropicKey} onChange={(e) => setS({ ...s, anthropicKey: e.target.value })} />
        </Field>
        <Field label="Model" wide>
          <input className="field font-mono text-xs" value={s.anthropicModel} onChange={(e) => setS({ ...s, anthropicModel: e.target.value })} />
        </Field>
        <Field label="Effort when grading">
          <EffortSelect value={s.anthropicGradingEffort} onChange={(v) => setS({ ...s, anthropicGradingEffort: v })} />
        </Field>
        <Field label="Effort for tips">
          <EffortSelect value={s.anthropicTipsEffort} onChange={(v) => setS({ ...s, anthropicTipsEffort: v })} />
        </Field>
        <LinkButton url="https://console.anthropic.com/settings/keys">Get an Anthropic API key</LinkButton>
      </ProviderBlock>

      <ProviderBlock
        title="Claude Code"
        note="Uses your Claude subscription. Each run is a short private session; nothing is added to your Claude Code setup."
      >
        <Field label="Path to claude" wide>
          <div className="flex gap-2">
            <input
              className="field font-mono text-xs"
              value={s.claudeCodePath}
              onChange={(e) => setS({ ...s, claudeCodePath: e.target.value })}
              placeholder="Leave empty to find it automatically"
            />
            <button type="button" className="btn btn-ghost min-w-24" onClick={testClaudeCode} disabled={testing}>
              {testing ? <LoaderCircle size={15} className="animate-spin" /> : 'Test'}
            </button>
          </div>
        </Field>
        <Field label="Model" wide>
          <input
            className="field font-mono text-xs"
            value={s.claudeCodeModel}
            onChange={(e) => setS({ ...s, claudeCodeModel: e.target.value })}
            placeholder="Your plan's default"
          />
        </Field>
      </ProviderBlock>
    </Section>
  )
}

function ProviderBlock({ title, note, children }: { title: string; note: string; children: React.ReactNode }) {
  return (
    <div className="mt-5 border-t border-line pt-4">
      <h3 className="text-xs font-semibold">{title}</h3>
      <p className="mb-3 text-[11px] text-ink-3">{note}</p>
      <div className="grid grid-cols-2 gap-4">{children}</div>
    </div>
  )
}

function EffortSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <select className="field" value={value} onChange={(e) => onChange(e.target.value)}>
      {EFFORTS.map((e) => (
        <option key={e} value={e}>
          {e}
        </option>
      ))}
    </select>
  )
}

function LinkButton({ url, children }: { url: string; children: React.ReactNode }) {
  return (
    <button type="button" className="col-span-2 flex items-center gap-1 text-xs text-indigo-300 hover:underline" onClick={() => BrowserOpenURL(url)}>
      <ExternalLink size={12} /> {children}
    </button>
  )
}
