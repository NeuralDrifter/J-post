import { Bookmark, Copy, ExternalLink, SquareKanban } from 'lucide-react'
import { useNavigate } from 'react-router'
import { Chip } from '../../components/Chip'
import { copyText } from '../../components/ContextMenu'
import { BrowserOpenURL } from '../../lib/backend'
import { openMenu } from '../../lib/menu'
import type { main } from '../../lib/backend'
import { formatDate, formatSalary, SOURCE_LABEL, STATUS_LABEL } from '../../lib/format'

type Props = {
  results: main.DiscoverResult[]
  selectedKey: string | null
  onSelect: (key: string) => void
  onSave: (r: main.DiscoverResult) => void
}

export function ResultsList({ results, selectedKey, onSelect, onSave }: Props) {
  const navigate = useNavigate()
  return (
    <ul className="space-y-2">
      {results.map((r) => {
        const salary = formatSalary(r.salaryMin, r.salaryMax)
        const selected = selectedKey === r.key
        return (
          <li
            key={r.key}
            onContextMenu={(e) =>
              openMenu(e, [
                r.trackedJobId
                  ? { label: 'Open tracked job', icon: SquareKanban, onSelect: () => navigate(`/jobs/${r.trackedJobId}`) }
                  : { label: 'Save to Wishlist', icon: Bookmark, onSelect: () => onSave(r) },
                'separator',
                { label: 'Open posting', icon: ExternalLink, disabled: !r.url, onSelect: () => BrowserOpenURL(r.url) },
                { label: 'Copy link', icon: Copy, disabled: !r.url, onSelect: () => copyText(r.url, 'Link copied') },
              ])
            }
          >
            <button
              onClick={() => onSelect(r.key)}
              className={`glass w-full rounded-xl p-3 text-left transition ${selected ? 'border-accent/60 bg-accent/10' : 'hover:border-line-strong'}`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-mono text-[11px] text-ink-2">{r.company || 'Unknown company'}</p>
                  <p className="text-sm leading-snug font-semibold">{r.title}</p>
                </div>
                {r.trackedJobId && <Chip tone="accent">Tracking · {STATUS_LABEL[r.trackedStatus]}</Chip>}
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {salary && (
                  <Chip tone="success">
                    {salary}
                    {r.annualized && ' ≈'}
                  </Chip>
                )}
                {r.location && <Chip>{r.location}</Chip>}
                {r.workMode === 'remote' && <Chip>Remote</Chip>}
                {r.datePosted && <Chip>{formatDate(r.datePosted)}</Chip>}
                {r.sources.map((s) => (
                  <Chip key={s} tone="info">
                    {SOURCE_LABEL[s] ?? s}
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
