// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

import { useState, type ChangeEvent, type InputHTMLAttributes, type ReactNode } from 'react'
import { ExternalLink, LoaderCircle } from 'lucide-react'
import { Field } from '../../components/Field'
import { ANSWER_MODES, ANTHROPIC_EFFORTS } from '../../generated/choices'
import { api } from '../../lib/api'
import { BrowserOpenURL, ListAIProviders, TestClaudeCode, type ai, type settings } from '../../lib/backend'
import { toast } from '../../lib/toast'
import { useLoad } from '../../lib/useLoad'
import { ModelPicker, TestProviderButton } from './ModelPicker'
import { initialProvider, PROVIDER_GROUPS, type ProviderGroup, type ProviderId } from './providerGroups'
import { Section } from './Section'

type Props = { s: settings.Settings; setS: (s: settings.Settings) => void }

/** A text setting's key. */
type TextKey = { [K in keyof settings.Settings]: settings.Settings[K] extends string ? K : never }[keyof settings.Settings]

/** value/onChange props that edit one text setting. */
function bindText({ s, setS }: Props, key: TextKey) {
  return { value: s[key], onChange: (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setS({ ...s, [key]: e.target.value }) }
}

/** Which provider does each AI job (interviews and job matching), and how each provider is set up. */
export function AIProvidersSection(props: Props) {
  const { s } = props
  // Readiness reflects saved settings; it refreshes after Save.
  const { data: providers } = useLoad(() => api(ListAIProviders()), [])
  const [testing, setTesting] = useState(false)

  const testClaudeCode = async () => {
    setTesting(true)
    const version = await api(TestClaudeCode(s.claudeCodePath))
    setTesting(false)
    if (version) toast.success(`Claude Code is ready (${version})`)
  }

  const providerSelect = (key: TextKey, label: string) => (
    <select className="field" {...bindText(props, key)} aria-label={label}>
      {(providers ?? []).map((p) => (
        <option key={p.id} value={p.id}>
          {p.label}
          {p.unavailable ? ' (setup needed)' : ''}
        </option>
      ))}
    </select>
  )

  // The setup fields of each provider, shown when it's picked in its group's
  // dropdown. A Record, so a new backend provider without setup here fails to compile.
  const setups: Record<ProviderId, () => ReactNode> = {
    'gemini-live': () => (
      <ProviderBlock note="Runs the interview itself, so it's always needed for the voice.">
        <Field label="Gemini API key" wide>
          <SecretInput {...bindText(props, 'geminiKey')} />
        </Field>
        <Field label="Live model" wide>
          <input className="field font-mono text-xs" {...bindText(props, 'geminiLiveModel')} />
        </Field>
        <LinkButton url="https://aistudio.google.com/apikey">Get a Gemini API key</LinkButton>
        <PrivacyNote>
          Privacy: on Google's free tier, what you send (your resume, interview audio and transcripts) may be used by Google to improve its products. The paid
          tier doesn't.
        </PrivacyNote>
      </ProviderBlock>
    ),
    anthropic: () => (
      <ProviderBlock note="Pay-as-you-go with your own API key.">
        <Field label="Anthropic API key" wide>
          <SecretInput {...bindText(props, 'anthropicKey')} />
        </Field>
        <Field label="Model" wide>
          <input className="field font-mono text-xs" {...bindText(props, 'anthropicModel')} />
        </Field>
        <Field label="Effort when grading">
          <EffortSelect {...bindText(props, 'anthropicGradingEffort')} />
        </Field>
        <Field label="Effort for tips">
          <EffortSelect {...bindText(props, 'anthropicTipsEffort')} />
        </Field>
        <LinkButton url="https://console.anthropic.com/settings/keys">Get an Anthropic API key</LinkButton>
      </ProviderBlock>
    ),
    'claude-code': () => (
      <ProviderBlock note="Uses your Claude subscription. Each run is a short private session; nothing is added to your Claude Code setup.">
        <Field label="Path to claude" wide>
          <div className="flex gap-2">
            <input className="field font-mono text-xs" {...bindText(props, 'claudeCodePath')} placeholder="Leave empty to find it automatically" />
            <button type="button" className="btn btn-ghost min-w-24" onClick={testClaudeCode} disabled={testing}>
              {testing ? <LoaderCircle size={15} className="animate-spin" /> : 'Test'}
            </button>
          </div>
        </Field>
        <Field label="Model" wide>
          <input className="field font-mono text-xs" {...bindText(props, 'claudeCodeModel')} placeholder="Your plan's default" />
        </Field>
      </ProviderBlock>
    ),
    openai: () => (
      <OpenAIStyleBlock
        {...props}
        providerId="openai"
        note="Pay-as-you-go with your own API key."
        secret={{ key: 'openaiKey', label: 'OpenAI API key' }}
        modelKey="openaiModel"
        testLabel="OpenAI"
        link={{ url: 'https://platform.openai.com/api-keys', text: 'Get an OpenAI API key' }}
      />
    ),
    deepseek: () => (
      <OpenAIStyleBlock
        {...props}
        providerId="deepseek"
        note="Pay-as-you-go with your own API key. Low prices; repeated instructions are cached automatically."
        secret={{ key: 'deepseekKey', label: 'DeepSeek API key' }}
        modelKey="deepseekModel"
        testLabel="DeepSeek"
        link={{ url: 'https://platform.deepseek.com/api_keys', text: 'Get a DeepSeek API key' }}
        footer={
          <PrivacyNote>
            Privacy: DeepSeek's privacy policy says it collects, processes and stores data in the People's Republic of China. Keep that in mind before sending
            your resume and interview transcripts.
          </PrivacyNote>
        }
      />
    ),
    ollama: () => (
      <OpenAIStyleBlock
        {...props}
        providerId="ollama"
        note="Runs models on your own computer: free, and nothing leaves your PC. Install Ollama and download a model first."
        serverKey="ollamaURL"
        modelKey="ollamaModel"
        testLabel="Ollama"
        link={{ url: 'https://ollama.com/download', text: 'Download Ollama' }}
      />
    ),
    lmstudio: () => (
      <OpenAIStyleBlock
        {...props}
        providerId="lmstudio"
        note="Runs models on your own computer: free, and nothing leaves your PC. Load a model and start the server in LM Studio's Developer tab."
        serverKey="lmStudioURL"
        secret={{ key: 'lmStudioKey', label: 'API token (only if Require Authentication is on)' }}
        modelKey="lmStudioModel"
        testLabel="LM Studio"
        link={{ url: 'https://lmstudio.ai/download', text: 'Download LM Studio' }}
      />
    ),
    'openai-compatible': () => (
      <OpenAIStyleBlock
        {...props}
        providerId="openai-compatible"
        note="Any other service that speaks OpenAI's format. Not tested by Job Track; use Test to check it."
        serverKey="customAIBaseURL"
        serverPlaceholder="https://example.com/v1"
        secret={{ key: 'customAIKey', label: 'API key (if needed)' }}
        modelKey="customAIModel"
        testLabel="the custom server"
      >
        <Field label="Answer mode" wide>
          <select className="field" {...bindText(props, 'customAIMode')}>
            {ANSWER_MODES.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        </Field>
        <p className="col-span-2 text-[11px] text-ink-3">Use plain if the server rejects the others.</p>
      </OpenAIStyleBlock>
    ),
  }

  return (
    <>
      <Section title="AI providers" hint="Pick which provider does each AI job. Set each provider up below.">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Interview grading (mock interview scorecards)">{providerSelect('gradingProvider', 'Interview grading provider')}</Field>
          <Field label="Coaching tips (during interviews)">{providerSelect('tipsProvider', 'Coaching tips provider')}</Field>
          <Field label="Question plan (before interviews)">{providerSelect('planProvider', 'Question plan provider')}</Field>
          <Field label="Job matching (Discover match scores)">{providerSelect('matchProvider', 'Job matching provider')}</Field>
        </div>
        <p className="mt-2 text-[11px] text-ink-3">
          Recommended for tips: Gemini Live — it answers in about a second. Claude Code takes several seconds just to start. Any interview can also be
          re-graded with another provider from its review page.
        </p>
        <p className="mt-1 text-[11px] text-ink-3">
          Question plan: Gemini Live is fastest; Claude Code and the Anthropic API usually write deeper questions but take up to a minute.
        </p>
        <p className="mt-1 text-[11px] text-ink-3">
          Job matching sends many postings per request, so a provider with a large context works best (Claude Code, the Anthropic API, OpenAI).
        </p>
        <p className="mt-1 text-[11px] text-ink-3">
          OpenAI, DeepSeek, Ollama or LM Studio on your own PC, or any OpenAI-compatible service can also do any of these jobs. Set them up below.
        </p>
      </Section>

      {PROVIDER_GROUPS.map((group) => (
        <ProviderGroupPicker key={group.id} group={group} providers={providers} initial={initialProvider(group, s)} renderSetup={(id) => setups[id]()} />
      ))}
    </>
  )
}

type OpenAIStyleProps = Props & {
  providerId: string
  note: string
  serverKey?: TextKey // the server address, for local apps and custom servers
  serverPlaceholder?: string
  secret?: { key: TextKey; label: string }
  modelKey: TextKey
  testLabel: string // "Test <testLabel>"
  link?: { url: string; text: string }
  children?: ReactNode // extra fields, after the model
  footer?: ReactNode // after the link
}

/** A provider reached through OpenAI's API format: server or key, model, Test, and where to get it. */
function OpenAIStyleBlock(props: OpenAIStyleProps) {
  const { s, providerId, note, serverKey, serverPlaceholder, secret, modelKey, testLabel, link, children, footer } = props
  return (
    <ProviderBlock note={note}>
      {serverKey && (
        <Field label="Server address" wide>
          <input className="field font-mono text-xs" {...bindText(props, serverKey)} placeholder={serverPlaceholder} />
        </Field>
      )}
      {secret && (
        <Field label={secret.label} wide>
          <SecretInput {...bindText(props, secret.key)} />
        </Field>
      )}
      <Field label="Model" wide>
        <ModelPicker providerId={providerId} settings={s} value={s[modelKey]} onChange={(v) => props.setS({ ...s, [modelKey]: v })} />
      </Field>
      {children}
      <TestProviderButton providerId={providerId} label={testLabel} settings={s} />
      {link && <LinkButton url={link.url}>{link.text}</LinkButton>}
      {footer}
    </ProviderBlock>
  )
}

type GroupPickerProps = {
  group: ProviderGroup
  providers: ai.AIProvider[] | undefined // labels and readiness, from the backend
  initial: ProviderId
  renderSetup: (id: ProviderId) => ReactNode
}

/** One group of providers, as its own card: its dropdown picks which provider's setup is shown. */
function ProviderGroupPicker({ group, providers, initial, renderSetup }: GroupPickerProps) {
  const [selected, setSelected] = useState(initial)
  return (
    <Section title={group.title} hint={group.hint}>
      <select
        className="field mb-4 w-auto min-w-64"
        value={selected}
        onChange={(e) => setSelected(e.target.value as ProviderId)}
        aria-label={`${group.title}: provider to set up`}
      >
        {group.providerIds.map((id) => {
          const provider = providers?.find((p) => p.id === id)
          return (
            <option key={id} value={id}>
              {provider?.label ?? id}
              {provider?.unavailable ? ' (setup needed)' : ''}
            </option>
          )
        })}
      </select>
      {renderSetup(selected)}
    </Section>
  )
}

/** One provider's setup: what it is, then its fields. */
function ProviderBlock({ note, children }: { note: string; children: ReactNode }) {
  return (
    <div>
      <p className="mb-3 text-[11px] text-ink-3">{note}</p>
      <div className="grid grid-cols-2 gap-4">{children}</div>
    </div>
  )
}

/** An API key or token box: masked, and never autofilled. */
function SecretInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input className="field" type="password" autoComplete="off" {...props} />
}

function PrivacyNote({ children }: { children: ReactNode }) {
  return <p className="col-span-2 rounded-xl border border-warn/30 bg-warn/5 px-3 py-2 text-[11px] leading-relaxed text-amber-200/90">{children}</p>
}

function EffortSelect(select: { value: string; onChange: (e: ChangeEvent<HTMLSelectElement>) => void }) {
  return (
    <select className="field" {...select}>
      {ANTHROPIC_EFFORTS.map((e) => (
        <option key={e} value={e}>
          {e}
        </option>
      ))}
    </select>
  )
}

function LinkButton({ url, children }: { url: string; children: ReactNode }) {
  return (
    <button type="button" className="col-span-2 flex items-center gap-1 text-xs text-indigo-300 hover:underline" onClick={() => BrowserOpenURL(url)}>
      <ExternalLink size={12} /> {children}
    </button>
  )
}
