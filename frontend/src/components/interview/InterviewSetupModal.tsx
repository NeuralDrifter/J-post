// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

import { useState, type SubmitEvent } from 'react'
import { useNavigate } from 'react-router'
import { LoaderCircle, Mic, TriangleAlert } from 'lucide-react'
import { NO_PLAN_PROVIDER } from '../../generated/choices'
import { api, errorMessage } from '../../lib/api'
import { GetProfile, GetSettings, ListAIProviders, PrepareInterview, type app } from '../../lib/backend'
import { formatDate } from '../../lib/format'
import { holdSession } from '../../lib/interview'
import { useInterviewOptions } from '../../lib/interviewOptions'
import { useLoad } from '../../lib/useLoad'
import { Field } from '../JobForm'
import { Modal } from '../Modal'
import { closeUnlessStarting, initialSetup, preparingLabel, type RetryInfo } from './setupState'
import { VoicePicker } from './VoicePicker'

/** Sets up a mock interview; with retry, a new attempt at that interview's question plan. */
export function InterviewSetupModal({ job, onClose, retry }: { job: app.Job; onClose: () => void; retry?: RetryInfo }) {
  const navigate = useNavigate()
  const { data: settings } = useLoad(() => api(GetSettings()), [])
  const { data: profile } = useLoad(() => api(GetProfile()), [])
  const { data: providers } = useLoad(() => api(ListAIProviders()), [])
  const [setup, setSetup] = useState<app.InterviewSetup>(() => initialSetup(job, retry))
  const [starting, setStarting] = useState(false)
  // What was actually submitted (Start without a plan differs from the form), for the button label.
  const [startingWith, setStartingWith] = useState<app.InterviewSetup>(setup)
  const [failure, setFailure] = useState('')
  const options = useInterviewOptions()

  const noKey = settings && !settings.geminiKey
  const noResume = profile && !profile.resumeText.trim()
  const plannerLabel = (s: app.InterviewSetup) => {
    const id = s.planProvider || settings?.planProvider || ''
    return providers?.find((p) => p.id === id)?.label ?? id
  }

  const begin = async (s: app.InterviewSetup) => {
    setStarting(true)
    setStartingWith(s)
    setFailure('')
    try {
      const live = await PrepareInterview(job.id, s)
      holdSession(live)
      onClose()
      navigate(`/interviews/${live.sessionId}/live`)
    } catch (err) {
      // Shown in the modal with ways forward, not as a passing toast.
      setFailure(errorMessage(err))
    } finally {
      setStarting(false)
    }
  }

  const start = (e: SubmitEvent) => {
    e.preventDefault()
    void begin(setup)
  }

  return (
    <Modal title={retry ? `Retry · ${job.company}` : `Mock interview · ${job.company}`} onClose={closeUnlessStarting(starting, onClose)} width="max-w-2xl">
      {noKey ? (
        <div className="space-y-4">
          <p className="text-sm text-ink-2">Mock interviews use Google Gemini. Add your Gemini API key in Settings → AI first.</p>
          <div className="flex justify-end gap-2">
            <button className="btn btn-ghost" onClick={onClose}>
              Cancel
            </button>
            <button
              className="btn btn-primary"
              onClick={() => {
                onClose()
                navigate('/settings')
              }}
            >
              Open Settings
            </button>
          </div>
        </div>
      ) : (
        <form onSubmit={start} className="space-y-5">
          {retry ? (
            <p className="text-sm text-ink-2">
              Retry: same questions as the interview on <strong className="text-ink">{formatDate(retry.startedAt)}</strong>. Type and length stay the same; pick
              any interviewer you like.
            </p>
          ) : (
            <p className="text-sm text-ink-2">
              A voice interviewer for <strong className="text-ink">{job.position}</strong> who has read the job description, your notes and your resume.
            </p>
          )}
          <div className="grid grid-cols-2 gap-4">
            <Field label="Interview type">
              <select className="field" value={setup.kind} disabled={!!retry} onChange={(e) => setSetup({ ...setup, kind: e.target.value })}>
                {options?.kinds.map((k) => (
                  <option key={k.id} value={k.id}>
                    {k.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Length">
              <div className="flex gap-1.5">
                {options?.minutes.map((m) => (
                  <button
                    key={m}
                    type="button"
                    disabled={!!retry}
                    onClick={() => setSetup({ ...setup, minutes: m })}
                    className={`btn flex-1 py-1.5 text-xs ${setup.minutes === m ? 'btn-primary' : 'btn-ghost'}`}
                  >
                    {m} min
                  </button>
                ))}
              </div>
            </Field>
            <Field label="Interviewer" wide>
              <div className="grid grid-cols-3 gap-2">
                {options?.personas.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setSetup({ ...setup, persona: p.id })}
                    className={`rounded-xl border p-2.5 text-left transition ${setup.persona === p.id ? 'border-accent/60 bg-accent/15' : 'border-line hover:border-line-strong'}`}
                  >
                    <span className="block text-sm font-semibold">{p.label}</span>
                    <span className="block text-[11px] text-ink-3">{p.description}</span>
                  </button>
                ))}
              </div>
            </Field>
            <Field label="Interviewer voice" wide>
              <VoicePicker value={setup.voice} onChange={(voice) => setSetup({ ...setup, voice, interviewerName: voice ? setup.interviewerName : '' })} />
            </Field>
            {setup.voice && (
              <Field label="Interviewer name (optional)" wide>
                <input
                  className="field"
                  value={setup.interviewerName}
                  onChange={(e) => setSetup({ ...setup, interviewerName: e.target.value })}
                  placeholder="Leave blank for a random name that fits the voice"
                />
              </Field>
            )}
            {!retry && (
              <Field label="Questions planned by" wide>
                <select
                  className="field"
                  value={setup.planProvider}
                  onChange={(e) => setSetup({ ...setup, planProvider: e.target.value })}
                  aria-label="Question plan provider"
                >
                  <option value="">Default ({providers?.find((p) => p.id === settings?.planProvider)?.label ?? 'from Settings'})</option>
                  {(providers ?? []).map((p) => (
                    <option key={p.id} value={p.id} disabled={!!p.unavailable}>
                      {p.unavailable ? `${p.label} — ${p.unavailable}` : p.label}
                    </option>
                  ))}
                </select>
              </Field>
            )}
            <Field label="Focus (optional)" wide>
              <textarea
                className="field"
                rows={2}
                value={setup.focus}
                onChange={(e) => setSetup({ ...setup, focus: e.target.value })}
                placeholder="e.g. grill me on system design, practice the salary question, conflict stories"
              />
            </Field>
          </div>
          {noResume && (
            <p className="flex items-start gap-2 rounded-xl border border-warn/40 bg-warn/10 px-3 py-2 text-xs text-amber-200">
              <TriangleAlert size={14} className="mt-0.5 shrink-0" />
              No resume yet, so questions will be generic. Upload one in Settings → Resume for questions about your real experience.
            </p>
          )}
          {failure && (
            <div className="space-y-2 rounded-xl border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-rose-200">
              <p>{failure}</p>
              <div className="flex flex-wrap gap-2">
                <button type="button" className="btn btn-ghost py-1 text-xs" onClick={() => void begin(setup)} disabled={starting}>
                  Try again
                </button>
                {!retry && (
                  <button
                    type="button"
                    className="btn btn-ghost py-1 text-xs"
                    onClick={() => void begin({ ...setup, planProvider: NO_PLAN_PROVIDER })}
                    disabled={starting}
                  >
                    Start without a plan
                  </button>
                )}
              </div>
              {!retry && <p className="text-ink-3">Or pick another provider under “Questions planned by”.</p>}
            </div>
          )}
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] text-ink-3">Uses your microphone. Headphones give the best results.</p>
            <div className="flex gap-2">
              <button type="button" className="btn btn-ghost" onClick={onClose} disabled={starting}>
                Cancel
              </button>
              <button className="btn btn-primary" disabled={starting}>
                {starting ? <LoaderCircle size={15} className="animate-spin" /> : <Mic size={15} />}{' '}
                {starting ? preparingLabel(plannerLabel(startingWith), startingWith) : 'Start'}
              </button>
            </div>
          </div>
        </form>
      )}
    </Modal>
  )
}
