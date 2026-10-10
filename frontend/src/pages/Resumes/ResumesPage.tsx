// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { FileText, FileUp, Mail, Plus, Trash2, type LucideIcon } from 'lucide-react'
import { confirmThen } from '../../components/ConfirmDialog'
import { PageTitle } from '../../components/PageTitle'
import { api } from '../../lib/api'
import { EmptyTrash, GetSettings, ListDocuments, ListJobSummaries, type app } from '../../lib/backend'
import { notifyDataChanged } from '../../lib/events'
import { openMenu } from '../../lib/menu'
import { libraryOrder } from '../../lib/resumes/library'
import { documentPath, LETTER_KIND, RESUME_KIND } from '../../lib/resumes/paths'
import { useLoad } from '../../lib/useLoad'
import { DocumentCard } from './DocumentCard'
import { kindNoun, liveDocumentMenu, trashedDocumentMenu } from './documentMenu'
import { ImportModal } from './ImportModal'
import { NewLetterModal } from './NewLetterModal'
import { NewResumeModal } from './NewResumeModal'

type Tab = 'resumes' | 'letters' | 'trash'

const TABS: { id: Tab; label: string; icon: LucideIcon }[] = [
  { id: 'resumes', label: 'Resumes', icon: FileText },
  { id: 'letters', label: 'Cover letters', icon: Mail },
  { id: 'trash', label: 'Trash', icon: Trash2 },
]

/** Every resume and cover letter, as cards: open one to edit it, right-click for the rest. */
export default function ResumesPage() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const tab = (TABS.find((t) => t.id === params.get('tab'))?.id ?? 'resumes') as Tab
  const [query, setQuery] = useState('')
  const [creating, setCreating] = useState(false)
  const [importing, setImporting] = useState(false)
  const { data: docs } = useLoad(() => loadTab(tab), [tab])
  const { data: settings } = useLoad(() => api(GetSettings()), [])
  const { data: summaries } = useLoad(() => api(ListJobSummaries()), [])
  const jobFor = (doc: app.Document) => summaries?.find((s) => s.job.id === doc.jobId)?.job
  const defaultId = settings?.defaultResumeId ?? ''
  const shown = libraryOrder(docs ?? [], defaultId, query)
  const open = (doc: app.Document) => navigate(documentPath(doc))
  const created = (doc: app.Document) => {
    setCreating(false)
    setImporting(false)
    notifyDataChanged()
    open(doc)
  }

  return (
    <div className="space-y-4">
      <PageTitle title="Resumes" subtitle="Your default resume is the one match scores and mock interviews read.">
        {tab !== 'trash' && (
          <div className="flex gap-2">
            <button className="btn btn-ghost" onClick={() => setImporting(true)}>
              <FileUp size={16} /> Import
            </button>
            <button className="btn btn-primary" onClick={() => setCreating(true)}>
              <Plus size={16} /> {tab === 'letters' ? 'New cover letter' : 'New resume'}
            </button>
          </div>
        )}
      </PageTitle>

      <div className="flex flex-wrap items-center gap-2">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button key={id} type="button" className={`btn py-1 text-xs ${id === tab ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setParams(id === 'resumes' ? {} : { tab: id })}>
            <Icon size={13} /> {label}
          </button>
        ))}
        <input className="field ml-auto w-60 py-1.5 text-xs" placeholder="Filter by name" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Filter by name" />
        {tab === 'trash' && shown.length > 0 && <EmptyTrashButton />}
      </div>

      {docs && shown.length === 0 ? (
        <EmptyState tab={tab} filtered={query.trim() !== ''} onNew={() => setCreating(true)} />
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-4">
          {shown.map((doc) =>
            tab === 'trash' ? (
              <DocumentCard key={doc.id} doc={doc} isDefault={false} dimmed label={kindNoun(doc)} onContextMenu={(e) => openMenu(e, trashedDocumentMenu(doc))} />
            ) : (
              <DocumentCard
                key={doc.id}
                doc={doc}
                isDefault={doc.id === defaultId}
                tailoredFor={jobFor(doc)}
                onOpen={() => open(doc)}
                onContextMenu={(e) => openMenu(e, liveDocumentMenu(doc, doc.id === defaultId, () => open(doc)))}
              />
            ),
          )}
        </div>
      )}

      {creating && tab === 'resumes' && <NewResumeModal onClose={() => setCreating(false)} onCreated={created} />}
      {creating && tab === 'letters' && <NewLetterModal defaultResumeId={defaultId} onClose={() => setCreating(false)} onCreated={created} />}
      {importing && <ImportModal onClose={() => setImporting(false)} onImported={created} />}
    </div>
  )
}

/** A tab's documents; Trash holds both kinds, most recently changed first. */
async function loadTab(tab: Tab): Promise<app.Document[] | undefined> {
  if (tab === 'resumes') return api(ListDocuments(RESUME_KIND, false))
  if (tab === 'letters') return api(ListDocuments(LETTER_KIND, false))
  const [resumes, letters] = await Promise.all([api(ListDocuments(RESUME_KIND, true)), api(ListDocuments(LETTER_KIND, true))])
  if (!resumes || !letters) return undefined
  return [...resumes, ...letters].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

function EmptyTrashButton() {
  const empty = async () => {
    const emptied = await confirmThen(
      { title: 'Empty Trash?', message: 'Every resume and cover letter in Trash will be permanently deleted.', confirmLabel: 'Empty Trash' },
      () => Promise.all([EmptyTrash(RESUME_KIND), EmptyTrash(LETTER_KIND)]),
    )
    if (emptied) notifyDataChanged()
  }
  return (
    <button type="button" className="btn btn-danger py-1 text-xs" onClick={empty}>
      <Trash2 size={13} /> Empty Trash
    </button>
  )
}

const EMPTY_MESSAGE: Record<Tab, string> = {
  resumes: 'No resumes yet. Create one to get started.',
  letters: 'No cover letters yet. Write one from any resume.',
  trash: 'Trash is empty.',
}

function EmptyState({ tab, filtered, onNew }: { tab: Tab; filtered: boolean; onNew: () => void }) {
  const Icon = TABS.find((t) => t.id === tab)?.icon ?? FileText
  return (
    <div className="grid min-h-64 place-items-center rounded-2xl border border-dashed border-line p-8 text-center">
      <div>
        <Icon size={28} className="mx-auto mb-3 text-ink-3" />
        <p className="text-sm text-ink-2">{filtered ? 'Nothing matches that name.' : EMPTY_MESSAGE[tab]}</p>
        {tab !== 'trash' && !filtered && (
          <button className="btn btn-primary mt-4" onClick={onNew}>
            <Plus size={16} /> {tab === 'letters' ? 'New cover letter' : 'New resume'}
          </button>
        )}
      </div>
    </div>
  )
}
