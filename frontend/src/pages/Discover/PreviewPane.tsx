import { Bookmark, ExternalLink, MapPin, SquareKanban, X } from 'lucide-react'
import { useNavigate } from 'react-router'
import { Chip } from '../../components/Chip'
import { Markdown } from '../../components/Markdown'
import { BrowserOpenURL, type main } from '../../lib/backend'
import { formatDate, formatSalary, SOURCE_LABEL } from '../../lib/format'

type Props = { result: main.DiscoverResult; saving: boolean; onSave: () => void; onClose: () => void }

/** Side pane on wide windows; a slide-over panel below 1100px. */
export function PreviewPane({ result, saving, onSave, onClose }: Props) {
  const navigate = useNavigate()
  const salary = formatSalary(result.salaryMin, result.salaryMax)

  return (
    <aside className="glass flex min-h-0 flex-col overflow-hidden rounded-2xl max-[1099px]:fixed max-[1099px]:inset-y-3 max-[1099px]:right-3 max-[1099px]:z-40 max-[1099px]:w-[min(560px,calc(100vw-1.5rem))] max-[1099px]:bg-raised max-[1099px]:shadow-2xl">
      <header className="border-b border-line p-4">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <p className="font-mono text-[11px] text-ink-2">{result.company || 'Unknown company'}</p>
            <h2 className="text-lg leading-snug font-bold">{result.title}</h2>
          </div>
          <button className="text-ink-2 hover:text-ink min-[1100px]:hidden" onClick={onClose} aria-label="Close preview">
            <X size={18} />
          </button>
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {salary && (
            <Chip tone="success" title={result.annualized ? 'Converted to a yearly figure' : undefined}>
              {salary}
              {result.annualized && ' ≈ annualized'}
            </Chip>
          )}
          {result.annualized && result.salaryText && <Chip>{result.salaryText}</Chip>}
          {result.location && (
            <Chip>
              <MapPin size={11} />
              {result.location}
            </Chip>
          )}
          {result.workMode === 'remote' && <Chip>Remote</Chip>}
          {result.datePosted && <Chip>Posted {formatDate(result.datePosted)}</Chip>}
          {result.sources.map((s) => (
            <Chip key={s} tone="info">
              {SOURCE_LABEL[s] ?? s}
            </Chip>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {result.trackedJobId ? (
            <button className="btn btn-ghost" onClick={() => navigate(`/jobs/${result.trackedJobId}`)}>
              <SquareKanban size={15} /> Open tracked job
            </button>
          ) : (
            <button className="btn btn-primary" disabled={saving} onClick={onSave}>
              <Bookmark size={15} /> Save to Wishlist
            </button>
          )}
          {result.url && (
            <button className="btn btn-ghost" onClick={() => BrowserOpenURL(result.url)}>
              <ExternalLink size={15} /> Original posting
            </button>
          )}
        </div>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {result.description ? <Markdown text={result.description} /> : <p className="text-sm text-ink-3">No description provided by this source.</p>}
      </div>
    </aside>
  )
}
