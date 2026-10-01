import { Panel } from '../../components/Panel'
import type { main } from '../../lib/backend'
import { CLOSE_REASON_LABEL, formatDateTime, STATUS_DOT, STATUS_LABEL } from '../../lib/format'

export function StageTimeline({ events }: { events: main.StageEvent[] }) {
  return (
    <Panel title="Stage history">
      {events.length === 0 ? (
        <p className="text-xs text-ink-3">No history yet.</p>
      ) : (
        <ol className="space-y-4 border-l border-line pl-4">
          {events.map((e, i) => {
            const latest = i === events.length - 1
            return (
              <li key={e.id} className="relative">
                <span
                  className={`absolute top-1.5 -left-[21px] h-2.5 w-2.5 rounded-full ring-4 ring-[#131b2e] ${
                    latest ? STATUS_DOT[e.toStatus] : 'bg-ink-3/60'
                  }`}
                />
                <p className={`text-sm font-semibold ${latest ? '' : 'text-ink-2'}`}>
                  {e.fromStatus ? STATUS_LABEL[e.toStatus] : `Added to ${STATUS_LABEL[e.toStatus]}`}
                  {e.closeReason && <span className="font-normal text-ink-2"> · {CLOSE_REASON_LABEL[e.closeReason]}</span>}
                </p>
                <p className="font-mono text-[11px] text-ink-3">{formatDateTime(e.at)}</p>
                {e.note && e.note !== 'imported' && <p className="mt-1 text-xs text-ink-2">{e.note}</p>}
              </li>
            )
          })}
        </ol>
      )}
    </Panel>
  )
}
