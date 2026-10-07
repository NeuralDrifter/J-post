import { Bookmark, Copy, ExternalLink, EyeOff, SquareKanban, Undo2 } from 'lucide-react'
import { useNavigate } from 'react-router'
import { Chip } from '../../components/Chip'
import { copyText } from '../../components/ContextMenu'
import { BrowserOpenURL, type main } from '../../lib/backend'
import { formatDate, formatSalary, labelFor, STATUS_LABEL, timeAgo } from '../../lib/format'
import { sourceLabel, useJobSources } from '../../lib/jobSources'
import { openMenu, type MenuEntry } from '../../lib/menu'

export type PostingActions = {
  save: (p: main.Posting) => void
  dismiss: (p: main.Posting) => void
  restore: (p: main.Posting) => void
}

type Props = {
  postings: main.Posting[]
  selectedId: string | null
  onSelect: (p: main.Posting) => void
  actions: PostingActions
}

export function PostingList({ postings, selectedId, onSelect, actions }: Props) {
  const navigate = useNavigate()
  const sources = useJobSources()

  const menu = (p: main.Posting): MenuEntry[] => {
    const link: MenuEntry[] = [
      { label: 'Open posting', icon: ExternalLink, disabled: !p.url, onSelect: () => BrowserOpenURL(p.url) },
      { label: 'Copy link', icon: Copy, disabled: !p.url, onSelect: () => copyText(p.url, 'Link copied') },
    ]
    if (p.state === 'saved') {
      return [{ label: 'Open job', icon: SquareKanban, disabled: !p.jobId, onSelect: () => navigate(`/jobs/${p.jobId}`) }, 'separator', ...link]
    }
    if (p.state === 'dismissed') {
      return [
        { label: 'Move back to inbox', icon: Undo2, onSelect: () => actions.restore(p) },
        { label: 'Add to Interested', icon: Bookmark, onSelect: () => actions.save(p) },
        'separator',
        ...link,
      ]
    }
    return [
      { label: 'Add to Interested', icon: Bookmark, onSelect: () => actions.save(p) },
      { label: 'Not interested', icon: EyeOff, onSelect: () => actions.dismiss(p) },
      'separator',
      ...link,
    ]
  }

  return (
    <ul className="space-y-2">
      {postings.map((p) => {
        const salary = formatSalary(p.salaryMin, p.salaryMax)
        const selected = selectedId === p.id
        return (
          <li key={p.id} onContextMenu={(e) => openMenu(e, menu(p))}>
            <button
              onClick={() => onSelect(p)}
              className={`glass w-full rounded-xl p-3 text-left transition ${selected ? 'border-accent/60 bg-accent/10' : 'hover:border-line-strong'}`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-mono text-[11px] text-ink-2">{p.company || 'Unknown company'}</p>
                  <p className={`text-sm leading-snug ${p.state === 'new' ? 'font-bold' : 'font-semibold'}`}>{p.title}</p>
                </div>
                {p.state === 'new' && <Chip tone="info">New</Chip>}
                {p.state === 'saved' && <Chip tone="accent">{p.jobStatus ? labelFor(STATUS_LABEL, p.jobStatus) : 'Job deleted'}</Chip>}
                {p.state === 'dismissed' && <Chip>{timeAgo(p.dismissedAt)}</Chip>}
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {salary && (
                  <Chip tone="success">
                    {salary}
                    {p.annualized && ' ≈'}
                  </Chip>
                )}
                {p.location && <Chip>{p.location}</Chip>}
                {p.workMode === 'remote' && <Chip>Remote</Chip>}
                {p.datePosted && <Chip>{formatDate(p.datePosted)}</Chip>}
                {p.sources.map((s) => (
                  <Chip key={s} tone="info">
                    {sourceLabel(sources, s)}
                  </Chip>
                ))}
              </div>
            </button>
          </li>
        )
      })}
    </ul>
  )
}
