import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router'
import { Mic, TriangleAlert } from 'lucide-react'
import { api } from '../../lib/api'
import { GetProfile, GetSettings, PrepareInterview, type main } from '../../lib/backend'
import { holdSession, MOCK_KINDS, MOCK_LENGTHS, MOCK_PERSONAS } from '../../lib/interview'
import { useLoad } from '../../lib/useLoad'
import { Field } from '../JobForm'
import { Modal } from '../Modal'
import { VoicePicker } from './VoicePicker'

export function InterviewSetupModal({ job, onClose }: { job: main.Job; onClose: () => void }) {
  const navigate = useNavigate()
  const { data: settings } = useLoad(() => api(GetSettings()), [])
  const { data: profile } = useLoad(() => api(GetProfile()), [])
  const [setup, setSetup] = useState<main.InterviewSetup>({
    kind: job.status === 'interviewing' ? 'behavioral' : 'phone_screen',
    minutes: 25,
    persona: 'neutral',
    voice: '', // surprise me
    interviewerName: '',
    focus: '',
  })
  const [starting, setStarting] = useState(false)

  const noKey = settings && !settings.geminiKey
  const noResume = profile && !profile.resumeText.trim()

  const start = async (e: FormEvent) => {
    e.preventDefault()
    setStarting(true)
    const live = await api(PrepareInterview(job.id, setup))
    setStarting(false)
    if (!live) return
    holdSession(live)
    onClose()
    navigate(`/interviews/${live.sessionId}/live`)
  }

  return (
    <Modal title={`Mock interview · ${job.company}`} onClose={onClose} width="max-w-2xl">
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
          <p className="text-sm text-ink-2">
            A voice interviewer for <strong className="text-ink">{job.position}</strong> who has read the job description, your notes and your resume.
          </p>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Interview type">
              <select className="field" value={setup.kind} onChange={(e) => setSetup({ ...setup, kind: e.target.value })}>
                {MOCK_KINDS.map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Length">
              <div className="flex gap-1.5">
                {MOCK_LENGTHS.map((m) => (
                  <button
                    key={m}
                    type="button"
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
                {MOCK_PERSONAS.map(([v, l, hint]) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setSetup({ ...setup, persona: v })}
                    className={`rounded-xl border p-2.5 text-left transition ${setup.persona === v ? 'border-accent/60 bg-accent/15' : 'border-line hover:border-line-strong'}`}
                  >
                    <span className="block text-sm font-semibold">{l}</span>
                    <span className="block text-[11px] text-ink-3">{hint}</span>
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
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] text-ink-3">Uses your microphone. Headphones give the best results.</p>
            <div className="flex gap-2">
              <button type="button" className="btn btn-ghost" onClick={onClose}>
                Cancel
              </button>
              <button className="btn btn-primary" disabled={starting}>
                <Mic size={15} /> {starting ? 'Preparing…' : 'Start'}
              </button>
            </div>
          </div>
        </form>
      )}
    </Modal>
  )
}
