import { useState, type FormEvent } from 'react'
import { Circle, CircleCheck, Copy, ExternalLink, Pencil, Plus, Trash2 } from 'lucide-react'
import { copyText } from '../../components/ContextMenu'
import { openMenu } from '../../lib/menu'
import { confirmDialog } from '../../components/ConfirmDialog'
import { IconButton } from '../../components/IconButton'
import { Field } from '../../components/JobForm'
import { Modal } from '../../components/Modal'
import { Panel } from '../../components/Panel'
import { api, apiOk } from '../../lib/api'
import { BrowserOpenURL, DeleteInterview, ListInterviews, SaveInterview, type main } from '../../lib/backend'
import { notifyDataChanged } from '../../lib/events'
import { formatDateTime, fromLocalInputValue, INTERVIEW_KINDS, INTERVIEW_KIND_LABEL, toLocalInputValue } from '../../lib/format'
import { useLoad } from '../../lib/useLoad'

const blankInterview = (jobId: string): main.Interview => ({
  id: '',
  jobId,
  kind: 'phone_screen',
  scheduledAt: '',
  durationMin: 30,
  locationOrLink: '',
  notes: '',
  completed: false,
})

export function InterviewsPanel({ jobId }: { jobId: string }) {
  const { data: interviews } = useLoad(() => api(ListInterviews(jobId)), [jobId])
  const [editing, setEditing] = useState<main.Interview | null>(null)

  const toggle = async (iv: main.Interview) => {
    if (await api(SaveInterview({ ...iv, completed: !iv.completed }))) notifyDataChanged()
  }

  const remove = async (iv: main.Interview) => {
    const ok = await confirmDialog({
      title: 'Delete interview?',
      message: `Delete the ${INTERVIEW_KIND_LABEL[iv.kind].toLowerCase()} on ${formatDateTime(iv.scheduledAt)}?`,
      confirmLabel: 'Delete',
      danger: true,
    })
    if (ok && (await apiOk(DeleteInterview(iv.id)))) notifyDataChanged()
  }

  return (
    <Panel
      title="Interviews"
      action={
        <IconButton label="Schedule interview" onClick={() => setEditing(blankInterview(jobId))}>
          <Plus size={15} />
        </IconButton>
      }
    >
      {interviews?.length ? (
        <ul className="space-y-2.5">
          {interviews.map((iv) => (
            <li
              key={iv.id}
              className={`group rounded-xl border border-line bg-white/[0.03] p-3 ${iv.completed ? 'opacity-55' : ''}`}
              onContextMenu={(e) => {
                const isLink = /^https?:\/\//i.test(iv.locationOrLink)
                openMenu(e, [
                  { label: 'Edit', icon: Pencil, onSelect: () => setEditing(iv) },
                  { label: iv.completed ? 'Mark not done' : 'Mark done', icon: iv.completed ? Circle : CircleCheck, onSelect: () => toggle(iv) },
                  'separator',
                  { label: 'Open meeting link', icon: ExternalLink, disabled: !isLink, onSelect: () => BrowserOpenURL(iv.locationOrLink) },
                  { label: isLink ? 'Copy link' : 'Copy location', icon: Copy, disabled: !iv.locationOrLink, onSelect: () => copyText(iv.locationOrLink) },
                  'separator',
                  { label: 'Delete', icon: Trash2, danger: true, onSelect: () => remove(iv) },
                ])
              }}
            >
              <div className="flex items-start gap-2">
                <button
                  className={`mt-0.5 shrink-0 ${iv.completed ? 'text-success' : 'text-ink-3 hover:text-ink'}`}
                  onClick={() => toggle(iv)}
                  title={iv.completed ? 'Mark as not done' : 'Mark as done'}
                  aria-label={iv.completed ? 'Mark as not done' : 'Mark as done'}
                >
                  {iv.completed ? <CircleCheck size={16} /> : <Circle size={16} />}
                </button>
                <div className="min-w-0 flex-1">
                  <p className={`text-sm font-semibold ${iv.completed ? 'line-through' : ''}`}>{INTERVIEW_KIND_LABEL[iv.kind]}</p>
                  <p className="font-mono text-[11px] text-cyan-300">
                    {formatDateTime(iv.scheduledAt)}
                    {iv.durationMin > 0 && ` · ${iv.durationMin} min`}
                  </p>
                </div>
                <div className="flex gap-0.5 opacity-0 transition group-hover:opacity-100 focus-within:opacity-100">
                  <IconButton label="Edit interview" onClick={() => setEditing(iv)}>
                    <Pencil size={13} />
                  </IconButton>
                  <IconButton label="Delete interview" onClick={() => remove(iv)}>
                    <Trash2 size={13} />
                  </IconButton>
                </div>
              </div>
              {iv.locationOrLink &&
                (/^https?:\/\//i.test(iv.locationOrLink) ? (
                  <button
                    className="mt-2 flex max-w-full items-center gap-1 truncate font-mono text-[11px] text-indigo-300 hover:underline"
                    onClick={() => BrowserOpenURL(iv.locationOrLink)}
                  >
                    <ExternalLink size={11} className="shrink-0" /> {iv.locationOrLink}
                  </button>
                ) : (
                  <p className="mt-2 font-mono text-[11px] text-ink-2">{iv.locationOrLink}</p>
                ))}
              {iv.notes && <p className="mt-2 text-xs whitespace-pre-wrap text-ink-2">{iv.notes}</p>}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-ink-3">Nothing scheduled.</p>
      )}
      {editing && <InterviewModal interview={editing} onClose={() => setEditing(null)} />}
    </Panel>
  )
}

function InterviewModal({ interview, onClose }: { interview: main.Interview; onClose: () => void }) {
  const [iv, setIv] = useState(interview)
  const [when, setWhen] = useState(() => toLocalInputValue(interview.scheduledAt))

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (await api(SaveInterview({ ...iv, scheduledAt: fromLocalInputValue(when) }))) {
      notifyDataChanged()
      onClose()
    }
  }

  return (
    <Modal title={interview.id ? 'Edit interview' : 'Schedule interview'} onClose={onClose}>
      <form onSubmit={submit} className="space-y-6">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Type">
            <select className="field" value={iv.kind} onChange={(e) => setIv({ ...iv, kind: e.target.value })}>
              {INTERVIEW_KINDS.map((k) => (
                <option key={k} value={k}>
                  {INTERVIEW_KIND_LABEL[k]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Duration (min)">
            <input
              className="field"
              type="number"
              min={0}
              step={15}
              value={iv.durationMin}
              onChange={(e) => setIv({ ...iv, durationMin: Math.max(0, Number(e.target.value) || 0) })}
            />
          </Field>
          <Field label="Date & time" wide>
            <input className="field" type="datetime-local" required value={when} onChange={(e) => setWhen(e.target.value)} />
          </Field>
          <Field label="Location or meeting link" wide>
            <input
              className="field"
              value={iv.locationOrLink}
              onChange={(e) => setIv({ ...iv, locationOrLink: e.target.value })}
              placeholder="https://zoom.us/j/… or an address"
            />
          </Field>
          <Field label="Notes" wide>
            <textarea className="field" rows={3} value={iv.notes} onChange={(e) => setIv({ ...iv, notes: e.target.value })} />
          </Field>
          {interview.id && (
            <label className="col-span-2 flex items-center gap-2 text-sm text-ink-2">
              <input type="checkbox" className="accent-indigo-500" checked={iv.completed} onChange={(e) => setIv({ ...iv, completed: e.target.checked })} />
              Completed
            </label>
          )}
        </div>
        <div className="flex justify-end gap-2">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary">Save interview</button>
        </div>
      </form>
    </Modal>
  )
}
