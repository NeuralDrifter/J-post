import { Bookmark, ExternalLink, EyeOff, MapPin, SquareKanban, Undo2, X } from 'lucide-react'
import { useNavigate } from 'react-router'
import { Chip } from '../../components/Chip'
import { Markdown } from '../../components/Markdown'
import { BrowserOpenURL, type main } from '../../lib/backend'
import { formatDate, formatSalary, SOURCE_LABEL } from '../../lib/format'
import type { PostingActions } from './PostingList'

type Props = { posting: main.Posting; busy: boolean; actions: PostingActions; onClose: () => void }

/** Side pane on wide windows; a slide-over panel below 1100px. */
export function PreviewPane({ posting: p, busy, actions, onClose }: Props) {
  const navigate = useNavigate()
  const salary = formatSalary(p.salaryMin, p.salaryMax)

  return (
    <aside className="glass flex min-h-0 flex-col overflow-hidden rounded-2xl max-[1099px]:fixed max-[1099px]:inset-y-3 max-[1099px]:right-3 max-[1099px]:z-40 max-[1099px]:w-[min(560px,calc(100vw-1.5rem))] max-[1099px]:bg-raised max-[1099px]:shadow-2xl">
      <header className="border-b border-line p-4">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <p className="font-mono text-[11px] text-ink-2">{p.company || 'Unknown company'}</p>
            <h2 className="text-lg leading-snug font-bold">{p.title}</h2>
          </div>
          <button className="text-ink-2 hover:text-ink min-[1100px]:hidden" onClick={onClose} aria-label="Close preview">
            <X size={18} />
          </button>
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {salary && (
            <Chip tone="success" title={p.annualized ? 'Converted to a yearly figure' : undefined}>
              {salary}
              {p.annualized && ' ≈ annualized'}
            </Chip>
          )}
          {p.annualized && p.salaryText && <Chip>{p.salaryText}</Chip>}
          {p.location && (
            <Chip>
              <MapPin size={11} />
              {p.location}
            </Chip>
          )}
          {p.workMode === 'remote' && <Chip>Remote</Chip>}
          {p.datePosted && <Chip>Posted {formatDate(p.datePosted)}</Chip>}
          {p.sources.map((s) => (
            <Chip key={s} tone="info">
              {SOURCE_LABEL[s] ?? s}
            </Chip>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {p.state === 'saved' ? (
            <button className="btn btn-ghost" disabled={!p.jobId} onClick={() => navigate(`/jobs/${p.jobId}`)}>
              <SquareKanban size={15} /> {p.jobId ? 'Open job' : 'Job was deleted'}
            </button>
          ) : (
            <button className="btn btn-primary" disabled={busy} onClick={() => actions.save(p)}>
              <Bookmark size={15} /> Save to Wishlist
            </button>
          )}
          {(p.state === 'new' || p.state === 'seen') && (
            <button className="btn btn-ghost" disabled={busy} onClick={() => actions.dismiss(p)}>
              <EyeOff size={15} /> Not interested
            </button>
          )}
          {p.state === 'dismissed' && (
            <button className="btn btn-ghost" disabled={busy} onClick={() => actions.restore(p)}>
              <Undo2 size={15} /> Move back to inbox
            </button>
          )}
          {p.url && (
            <button className="btn btn-ghost" onClick={() => BrowserOpenURL(p.url)}>
              <ExternalLink size={15} /> Original posting
            </button>
          )}
        </div>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {p.description ? <Markdown text={p.description} /> : <p className="text-sm text-ink-3">No description provided by this source.</p>}
      </div>
    </aside>
  )
}
