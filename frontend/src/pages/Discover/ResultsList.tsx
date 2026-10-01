import { Chip } from '../../components/Chip'
import type { main } from '../../lib/backend'
import { formatDate, formatSalary, SOURCE_LABEL, STATUS_LABEL } from '../../lib/format'

type Props = { results: main.DiscoverResult[]; selectedKey: string | null; onSelect: (key: string) => void }

export function ResultsList({ results, selectedKey, onSelect }: Props) {
  return (
    <ul className="space-y-2">
      {results.map((r) => {
        const salary = formatSalary(r.salaryMin, r.salaryMax)
        const selected = selectedKey === r.key
        return (
          <li key={r.key}>
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
