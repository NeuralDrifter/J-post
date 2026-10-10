// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

import { useState } from 'react'
import { useNavigate } from 'react-router'
import { FileText, Plus, Trash2 } from 'lucide-react'
import { confirmThen } from '../../components/ConfirmDialog'
import { PageTitle } from '../../components/PageTitle'
import { api } from '../../lib/api'
import { EmptyTrash, GetSettings, ListDocuments, type app } from '../../lib/backend'
import { notifyDataChanged } from '../../lib/events'
import { openMenu } from '../../lib/menu'
import { RESUME_KIND } from '../../lib/resumes/actions'
import { libraryOrder } from '../../lib/resumes/library'
import { useLoad } from '../../lib/useLoad'
import { DocumentCard } from './DocumentCard'
import { liveDocumentMenu, trashedDocumentMenu } from './documentMenu'
import { NewResumeModal } from './NewResumeModal'

type Tab = 'live' | 'trash'

const TAB_LABEL: Record<Tab, string> = { live: 'Resumes', trash: 'Trash' }

/** Every resume, as cards: open one to edit it, right-click for the rest. */
export default function ResumesPage() {
  const navigate = useNavigate()
  const [tab, setTab] = useState<Tab>('live')
  const [query, setQuery] = useState('')
  const [creating, setCreating] = useState(false)
  const { data: docs } = useLoad(() => api(ListDocuments(RESUME_KIND, tab === 'trash')), [tab])
  const { data: settings } = useLoad(() => api(GetSettings()), [])
  const defaultId = settings?.defaultResumeId ?? ''
  const shown = libraryOrder(docs ?? [], defaultId, query)
  const open = (doc: app.Document) => navigate(`/resumes/${doc.id}`)

  return (
    <div className="space-y-4">
      <PageTitle title="Resumes" subtitle="Your default resume is the one match scores and mock interviews read.">
        <button className="btn btn-primary" onClick={() => setCreating(true)}>
          <Plus size={16} /> New resume
        </button>
      </PageTitle>

      <div className="flex flex-wrap items-center gap-2">
        {(Object.keys(TAB_LABEL) as Tab[]).map((t) => (
          <button key={t} type="button" className={`btn py-1 text-xs ${t === tab ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setTab(t)}>
            {TAB_LABEL[t]}
          </button>
        ))}
        <input className="field ml-auto w-60 py-1.5 text-xs" placeholder="Filter by name" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Filter resumes" />
        {tab === 'trash' && shown.length > 0 && <EmptyTrashButton />}
      </div>

      {docs && shown.length === 0 ? (
        <EmptyState tab={tab} filtered={query.trim() !== ''} onNew={() => setCreating(true)} />
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-4">
          {shown.map((doc) =>
            tab === 'live' ? (
              <DocumentCard
                key={doc.id}
                doc={doc}
                isDefault={doc.id === defaultId}
                onOpen={() => open(doc)}
                onContextMenu={(e) => openMenu(e, liveDocumentMenu(doc, doc.id === defaultId, () => open(doc)))}
              />
            ) : (
              <DocumentCard key={doc.id} doc={doc} isDefault={false} dimmed onContextMenu={(e) => openMenu(e, trashedDocumentMenu(doc))} />
            ),
          )}
        </div>
      )}

      {creating && (
        <NewResumeModal
          onClose={() => setCreating(false)}
          onCreated={(doc) => {
            setCreating(false)
            notifyDataChanged()
            open(doc)
          }}
        />
      )}
    </div>
  )
}

function EmptyTrashButton() {
  const empty = async () => {
    const emptied = await confirmThen(
      { title: 'Empty Trash?', message: 'Every resume in Trash will be permanently deleted.', confirmLabel: 'Empty Trash' },
      () => EmptyTrash(RESUME_KIND),
    )
    if (emptied) notifyDataChanged()
  }
  return (
    <button type="button" className="btn btn-danger py-1 text-xs" onClick={empty}>
      <Trash2 size={13} /> Empty Trash
    </button>
  )
}

function EmptyState({ tab, filtered, onNew }: { tab: Tab; filtered: boolean; onNew: () => void }) {
  const message = filtered ? 'No resumes match that name.' : tab === 'trash' ? 'Trash is empty.' : 'No resumes yet. Create one to get started.'
  return (
    <div className="grid min-h-64 place-items-center rounded-2xl border border-dashed border-line p-8 text-center">
      <div>
        <FileText size={28} className="mx-auto mb-3 text-ink-3" />
        <p className="text-sm text-ink-2">{message}</p>
        {tab === 'live' && !filtered && (
          <button className="btn btn-primary mt-4" onClick={onNew}>
            <Plus size={16} /> New resume
          </button>
        )}
      </div>
    </div>
  )
}
