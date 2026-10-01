import { useState, type FormEvent } from 'react'
import { Copy, Link2, Pencil, Phone, Plus, Trash2 } from 'lucide-react'
import { openMenu } from '../../lib/menu'
import { confirmDialog } from '../../components/ConfirmDialog'
import { IconButton } from '../../components/IconButton'
import { Field } from '../../components/JobForm'
import { Modal } from '../../components/Modal'
import { Panel } from '../../components/Panel'
import { api, apiOk } from '../../lib/api'
import { BrowserOpenURL, DeleteContact, ListContacts, SaveContact, type main } from '../../lib/backend'
import { notifyDataChanged } from '../../lib/events'
import { toast } from '../../lib/toast'
import { useLoad } from '../../lib/useLoad'

const blankContact = (jobId: string): main.Contact => ({
  id: '',
  jobId,
  name: '',
  role: '',
  email: '',
  phone: '',
  linkedinUrl: '',
  notes: '',
})

export function ContactsPanel({ jobId }: { jobId: string }) {
  const { data: contacts } = useLoad(() => api(ListContacts(jobId)), [jobId])
  const [editing, setEditing] = useState<main.Contact | null>(null)

  const remove = async (c: main.Contact) => {
    const ok = await confirmDialog({ title: 'Remove contact?', message: `Remove ${c.name} from this job?`, confirmLabel: 'Remove', danger: true })
    if (ok && (await apiOk(DeleteContact(c.id)))) notifyDataChanged()
  }

  const copyEmail = async (email: string) => {
    try {
      await navigator.clipboard.writeText(email)
      toast.success(`Copied ${email}`)
    } catch {
      toast.error('Could not copy to the clipboard')
    }
  }

  return (
    <Panel
      title="Contacts"
      action={
        <IconButton label="Add contact" onClick={() => setEditing(blankContact(jobId))}>
          <Plus size={15} />
        </IconButton>
      }
    >
      {contacts?.length ? (
        <ul className="space-y-2.5">
          {contacts.map((c) => (
            <li
              key={c.id}
              className="group rounded-xl border border-line bg-white/[0.03] p-3"
              onContextMenu={(e) =>
                openMenu(e, [
                  { label: 'Edit', icon: Pencil, onSelect: () => setEditing(c) },
                  { label: 'Copy email', icon: Copy, disabled: !c.email, onSelect: () => copyEmail(c.email) },
                  { label: 'Open LinkedIn', icon: Link2, disabled: !c.linkedinUrl, onSelect: () => BrowserOpenURL(c.linkedinUrl) },
                  'separator',
                  { label: 'Remove', icon: Trash2, danger: true, onSelect: () => remove(c) },
                ])
              }
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-semibold">{c.name}</p>
                  {c.role && <p className="text-xs text-ink-2">{c.role}</p>}
                </div>
                <div className="flex gap-0.5 opacity-0 transition group-hover:opacity-100 focus-within:opacity-100">
                  <IconButton label="Edit contact" onClick={() => setEditing(c)}>
                    <Pencil size={13} />
                  </IconButton>
                  <IconButton label="Remove contact" onClick={() => remove(c)}>
                    <Trash2 size={13} />
                  </IconButton>
                </div>
              </div>
              {(c.email || c.phone || c.linkedinUrl) && (
                <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 font-mono text-[11px]">
                  {c.email && (
                    <button className="flex items-center gap-1 text-indigo-300 hover:underline" onClick={() => copyEmail(c.email)} title="Copy email">
                      <Copy size={11} /> {c.email}
                    </button>
                  )}
                  {c.phone && (
                    <span className="flex items-center gap-1 text-ink-2">
                      <Phone size={11} /> {c.phone}
                    </span>
                  )}
                  {c.linkedinUrl && (
                    <button className="flex items-center gap-1 text-indigo-300 hover:underline" onClick={() => BrowserOpenURL(c.linkedinUrl)}>
                      <Link2 size={11} /> LinkedIn
                    </button>
                  )}
                </div>
              )}
              {c.notes && <p className="mt-2 text-xs whitespace-pre-wrap text-ink-2">{c.notes}</p>}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-ink-3">No contacts yet. Add the recruiter or hiring manager.</p>
      )}
      {editing && <ContactModal contact={editing} onClose={() => setEditing(null)} />}
    </Panel>
  )
}

function ContactModal({ contact, onClose }: { contact: main.Contact; onClose: () => void }) {
  const [c, setC] = useState(contact)
  const set = (key: keyof main.Contact) => (e: { target: { value: string } }) => setC({ ...c, [key]: e.target.value })

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (await api(SaveContact(c))) {
      notifyDataChanged()
      onClose()
    }
  }

  return (
    <Modal title={contact.id ? 'Edit contact' : 'Add contact'} onClose={onClose}>
      <form onSubmit={submit} className="space-y-6">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Name">
            <input className="field" required autoFocus value={c.name} onChange={set('name')} />
          </Field>
          <Field label="Role">
            <input className="field" value={c.role} onChange={set('role')} placeholder="Recruiter, hiring manager…" />
          </Field>
          <Field label="Email">
            <input className="field" type="email" value={c.email} onChange={set('email')} />
          </Field>
          <Field label="Phone">
            <input className="field" value={c.phone} onChange={set('phone')} />
          </Field>
          <Field label="LinkedIn URL" wide>
            <input className="field" value={c.linkedinUrl} onChange={set('linkedinUrl')} placeholder="https://linkedin.com/in/…" />
          </Field>
          <Field label="Notes" wide>
            <textarea className="field" rows={3} value={c.notes} onChange={set('notes')} />
          </Field>
        </div>
        <div className="flex justify-end gap-2">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary">Save contact</button>
        </div>
      </form>
    </Modal>
  )
}
