// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router'
import {
  BadgeDollarSign,
  Briefcase,
  ChartNoAxesColumn,
  Clock,
  Download,
  FileText,
  FileUp,
  History,
  Mail,
  Mic,
  Plus,
  ScanText,
  Search,
  Settings,
  SquareKanban,
  X,
  type LucideIcon,
} from 'lucide-react'
import { api } from '../lib/api'
import { GetSettings, ListDocuments, ListJobSummaries, type app } from '../lib/backend'
import {
  filterAndRankCommands,
  loadRecentCommandIds,
  recordRecentCommandId,
  shouldOpenCommandPalette,
} from '../lib/commands/commandPalette'
import { notifyDataChanged } from '../lib/events'
import { exportJobsCsv } from '../lib/exportFiles'
import { documentPath, LETTER_KIND, RESUME_KIND } from '../lib/resumes/paths'
import { useLoad } from '../lib/useLoad'
import { ImportJobsModal } from '../pages/Pipeline/ImportJobsModal'
import { ImportModal } from '../pages/Resumes/ImportModal'
import { NewLetterModal } from '../pages/Resumes/NewLetterModal'
import { NewResumeModal } from '../pages/Resumes/NewResumeModal'

type ItemKind = 'recent' | 'action' | 'page' | 'job' | 'document'

type PaletteEntry = {
  id: string
  kind: ItemKind
  title: string
  subtitle?: string
  keywords?: string[]
  icon: LucideIcon
  badge?: string
  run: () => void | Promise<void>
}

type ModalKind = 'new-resume' | 'new-letter' | 'import-resume' | 'import-jobs' | null

export function CommandPalette() {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [activeModal, setActiveModal] = useState<ModalKind>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const { data: summaries } = useLoad(() => api(ListJobSummaries()), [open])
  const { data: resumes } = useLoad(() => api(ListDocuments(RESUME_KIND, false)), [open])
  const { data: letters } = useLoad(() => api(ListDocuments(LETTER_KIND, false)), [open])
  const { data: settings } = useLoad(() => api(GetSettings()), [open])

  // Global Ctrl+K listener
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && open) {
        e.preventDefault()
        setOpen(false)
        return
      }

      const hasOtherDialog = Boolean(
        document.querySelector('[role="dialog"]:not([data-command-palette="true"]), dialog[open]'),
      )

      if (shouldOpenCommandPalette(e, hasOtherDialog)) {
        e.preventDefault()
        setOpen((prev) => {
          if (!prev) {
            setQuery('')
            setSelectedIndex(0)
          }
          return !prev
        })
      }
    }

    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  // Focus input on open
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 10)
    }
  }, [open])

  // Construct items catalogue
  const allEntries = useMemo((): PaletteEntry[] => {
    const entries: PaletteEntry[] = []

    // 1. Pages
    entries.push(
      { id: 'page-pipeline', kind: 'page', title: 'Pipeline', subtitle: 'Job tracking board', icon: SquareKanban, run: () => navigate('/') },
      { id: 'page-discover', kind: 'page', title: 'Discover', subtitle: 'Search and import postings', icon: Search, run: () => navigate('/discover') },
      { id: 'page-resumes', kind: 'page', title: 'Resumes', subtitle: 'Resume and letter library', icon: FileText, run: () => navigate('/resumes') },
      { id: 'page-offers', kind: 'page', title: 'Offers', subtitle: 'Compensation and offer comparison', icon: BadgeDollarSign, run: () => navigate('/offers') },
      { id: 'page-interviews', kind: 'page', title: 'Interviews', subtitle: 'Upcoming rounds and prep', icon: Mic, run: () => navigate('/interviews') },
      { id: 'page-insights', kind: 'page', title: 'Insights', subtitle: 'Search metrics and progress', icon: ChartNoAxesColumn, run: () => navigate('/insights') },
      { id: 'page-settings', kind: 'page', title: 'Settings', subtitle: 'App preferences and models', icon: Settings, run: () => navigate('/settings') },
    )

    // 2. Actions
    entries.push(
      {
        id: 'action-new-application',
        kind: 'action',
        title: 'New application',
        subtitle: 'Add a new job application',
        keywords: ['add job', 'create application'],
        icon: Plus,
        run: () => {
          window.dispatchEvent(new CustomEvent('jobtrack:new-application', { detail: {} }))
        },
      },
      {
        id: 'action-new-resume',
        kind: 'action',
        title: 'New resume',
        subtitle: 'Create a tailored or blank resume',
        keywords: ['create resume', 'builder'],
        icon: Plus,
        run: () => setActiveModal('new-resume'),
      },
      {
        id: 'action-new-letter',
        kind: 'action',
        title: 'New cover letter',
        subtitle: 'Write a cover letter from a resume',
        keywords: ['create letter'],
        icon: Plus,
        run: () => setActiveModal('new-letter'),
      },
      {
        id: 'action-import-resume',
        kind: 'action',
        title: 'Import resume',
        subtitle: 'Import PDF, Word, or JSON Resume',
        keywords: ['upload resume'],
        icon: FileUp,
        run: () => setActiveModal('import-resume'),
      },
      {
        id: 'action-import-jobs',
        kind: 'action',
        title: 'Import jobs from CSV',
        subtitle: 'Import application rows from spreadsheet',
        keywords: ['csv upload'],
        icon: FileUp,
        run: () => setActiveModal('import-jobs'),
      },
      {
        id: 'action-export-pipeline',
        kind: 'action',
        title: 'Export pipeline CSV',
        subtitle: 'Download all tracked jobs as spreadsheet',
        keywords: ['export csv', 'backup jobs'],
        icon: Download,
        run: () => {
          if (summaries) void exportJobsCsv(summaries.map((s) => s.job))
        },
      },
      {
        id: 'action-ats-checker',
        kind: 'action',
        title: 'Open ATS checker',
        subtitle: 'Test resume PDF against applicant tracking systems',
        keywords: ['ats check', 'scan resume', 'keywords'],
        icon: ScanText,
        run: () => navigate('/resumes/check'),
      },
    )

    // 3. Jobs
    if (summaries) {
      for (const { job } of summaries) {
        entries.push({
          id: `job-${job.id}`,
          kind: 'job',
          title: job.position || 'Untitled position',
          subtitle: `${job.company || 'Unknown company'} · ${job.status}`,
          keywords: [job.company, job.location, job.status],
          icon: Briefcase,
          badge: job.status,
          run: () => navigate(`/jobs/${job.id}`),
        })
      }
    }

    // 4. Documents (Resumes and Letters)
    if (resumes) {
      for (const doc of resumes) {
        entries.push({
          id: `doc-${doc.id}`,
          kind: 'document',
          title: doc.name,
          subtitle: 'Resume',
          keywords: ['resume', 'cv'],
          icon: FileText,
          run: () => navigate(documentPath(doc)),
        })
      }
    }

    if (letters) {
      for (const doc of letters) {
        entries.push({
          id: `doc-${doc.id}`,
          kind: 'document',
          title: doc.name,
          subtitle: 'Cover letter',
          keywords: ['cover letter'],
          icon: Mail,
          run: () => navigate(documentPath(doc)),
        })
      }
    }

    return entries
  }, [navigate, summaries, resumes, letters])

  // Filtered and grouped items
  const { visibleList, groups } = useMemo(() => {
    const trimmed = query.trim()
    const byId = new Map(allEntries.map((e) => [e.id, e]))

    if (!trimmed) {
      const recentIds = loadRecentCommandIds()
      const recentEntries = recentIds.map((id) => byId.get(id)).filter((e): e is PaletteEntry => !!e)

      const groupMap: { label: string; items: PaletteEntry[] }[] = []

      if (recentEntries.length > 0) {
        groupMap.push({ label: 'Recent', items: recentEntries })
      }

      groupMap.push({
        label: 'Actions',
        items: allEntries.filter((e) => e.kind === 'action'),
      })

      groupMap.push({
        label: 'Pages',
        items: allEntries.filter((e) => e.kind === 'page'),
      })

      const flat = groupMap.flatMap((g) => g.items)
      return { visibleList: flat, groups: groupMap }
    }

    // When query is typed: rank all entries
    const ranked = filterAndRankCommands(allEntries, trimmed)

    // Group ranked items by category
    const kindOrder: { kind: ItemKind; label: string }[] = [
      { kind: 'action', label: 'Actions' },
      { kind: 'page', label: 'Pages' },
      { kind: 'job', label: 'Jobs' },
      { kind: 'document', label: 'Resumes & Letters' },
    ]

    const groupMap: { label: string; items: PaletteEntry[] }[] = []
    for (const { kind, label } of kindOrder) {
      const itemsInKind = ranked.filter((e) => e.kind === kind)
      if (itemsInKind.length > 0) {
        groupMap.push({ label, items: itemsInKind })
      }
    }

    const flat = groupMap.flatMap((g) => g.items)
    return { visibleList: flat, groups: groupMap }
  }, [allEntries, query])

  // Keep selectedIndex in bounds
  useEffect(() => {
    setSelectedIndex((prev) => {
      if (visibleList.length === 0) return 0
      return Math.min(prev, visibleList.length - 1)
    })
  }, [visibleList.length])

  // Execute item
  const executeItem = (item: PaletteEntry) => {
    recordRecentCommandId(item.id)
    setOpen(false)
    void item.run()
  }

  // Keyboard navigation within palette
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIndex((prev) => (visibleList.length === 0 ? 0 : (prev + 1) % visibleList.length))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIndex((prev) => (visibleList.length === 0 ? 0 : (prev - 1 + visibleList.length) % visibleList.length))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const item = visibleList[selectedIndex]
      if (item) executeItem(item)
    }
  }

  // Handle document creation/import from secondary modal
  const onDocumentCreated = (doc: app.Document) => {
    setActiveModal(null)
    notifyDataChanged()
    navigate(documentPath(doc))
  }

  return (
    <>
      {open &&
        createPortal(
          <div
            className="fixed inset-0 z-50 grid place-items-start bg-black/60 pt-[10vh] backdrop-blur-sm px-4"
            onMouseDown={() => setOpen(false)}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-label="Command palette"
              data-command-palette="true"
              className="glass max-h-[80vh] w-full max-w-xl overflow-hidden rounded-2xl bg-raised/95 border border-line shadow-[0_20px_50px_-15px_rgb(0_0_0/0.8),0_0_30px_-5px_rgb(99_102_241/0.15)] flex flex-col"
              onMouseDown={(e) => e.stopPropagation()}
            >
              {/* Search input header */}
              <div className="flex items-center gap-3 border-b border-line px-4 py-3">
                <Search size={18} className="shrink-0 text-ink-3" />
                <input
                  ref={inputRef}
                  className="field border-none bg-transparent p-0 text-sm focus:ring-0 focus:outline-none flex-1 text-ink placeholder:text-ink-3"
                  placeholder="Jump to page, job, resume, or action… (Ctrl+K)"
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value)
                    setSelectedIndex(0)
                  }}
                  onKeyDown={onKeyDown}
                />
                {query && (
                  <button
                    type="button"
                    className="text-ink-3 hover:text-ink"
                    onClick={() => {
                      setQuery('')
                      inputRef.current?.focus()
                    }}
                    aria-label="Clear query"
                  >
                    <X size={15} />
                  </button>
                )}
                <kbd className="rounded border border-line bg-white/5 px-1.5 py-0.5 font-mono text-[10px] text-ink-3 select-none">
                  ESC
                </kbd>
              </div>

              {/* Items list */}
              <div ref={listRef} className="overflow-y-auto p-2 min-h-36 max-h-[60vh] space-y-3">
                {visibleList.length === 0 ? (
                  <div className="py-10 text-center text-xs text-ink-3">No matching items found.</div>
                ) : (
                  groups.map((group) => (
                    <div key={group.label} className="space-y-1">
                      <div className="label-mono px-3 py-1 text-[11px] text-ink-3">{group.label}</div>
                      {group.items.map((item) => {
                        const itemIndex = visibleList.indexOf(item)
                        const isSelected = itemIndex === selectedIndex
                        const Icon = item.icon

                        return (
                          <button
                            key={item.id}
                            type="button"
                            className={`flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-left text-sm transition ${
                              isSelected
                                ? 'bg-accent/20 text-ink shadow-[inset_2px_0_0_var(--color-accent)]'
                                : 'text-ink-2 hover:bg-white/5 hover:text-ink'
                            }`}
                            onClick={() => executeItem(item)}
                            onMouseEnter={() => setSelectedIndex(itemIndex)}
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <Icon size={16} className={`shrink-0 ${isSelected ? 'text-accent' : 'text-ink-3'}`} />
                              <div className="min-w-0 truncate">
                                <p className="truncate font-medium leading-snug">{item.title}</p>
                                {item.subtitle && (
                                  <p className="truncate text-xs text-ink-3 leading-snug">{item.subtitle}</p>
                                )}
                              </div>
                            </div>
                            {item.badge && (
                              <span className="shrink-0 rounded border border-line bg-white/5 px-1.5 py-0.5 font-mono text-[10px] text-ink-3">
                                {item.badge}
                              </span>
                            )}
                          </button>
                        )
                      })}
                    </div>
                  ))
                )}
              </div>

              {/* Footer hint */}
              <div className="flex items-center justify-between border-t border-line bg-black/20 px-4 py-2 font-mono text-[11px] text-ink-3">
                <span>↑↓ to navigate · ↵ to select</span>
                <span>ESC to close</span>
              </div>
            </div>
          </div>,
          document.body,
        )}

      {/* Secondary modals launched from actions */}
      {activeModal === 'new-resume' && (
        <NewResumeModal onClose={() => setActiveModal(null)} onCreated={onDocumentCreated} />
      )}
      {activeModal === 'new-letter' && (
        <NewLetterModal
          defaultResumeId={settings?.defaultResumeId ?? ''}
          onClose={() => setActiveModal(null)}
          onCreated={onDocumentCreated}
        />
      )}
      {activeModal === 'import-resume' && (
        <ImportModal onClose={() => setActiveModal(null)} onImported={onDocumentCreated} />
      )}
      {activeModal === 'import-jobs' && (
        <ImportJobsModal
          existing={(summaries ?? []).map((s) => s.job)}
          onClose={() => {
            setActiveModal(null)
            notifyDataChanged()
          }}
        />
      )}
    </>
  )
}
