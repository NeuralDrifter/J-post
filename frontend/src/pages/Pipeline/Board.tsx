import { useRef, useState } from 'react'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { main } from '../../lib/backend'
import { STATUSES, STATUS_DOT, STATUS_LABEL, type Status } from '../../lib/format'
import { readPref, writePref } from '../../lib/prefs'
import { JobCard } from './JobCard'

type Props = {
  summaries: main.JobSummary[]
  onMove: (jobId: string, status: Status) => void
  onOpen: (jobId: string) => void
}

export function Board({ summaries, onMove, onOpen }: Props) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))
  const [activeId, setActiveId] = useState<string | null>(null)
  const [closedOpen, setClosedOpen] = useState(() => readPref('closedOpen', 'true') === 'true')
  const lastDragEnd = useRef(0)

  const toggleClosed = () => {
    setClosedOpen((open) => {
      writePref('closedOpen', String(!open))
      return !open
    })
  }

  const onDragEnd = (e: DragEndEvent) => {
    setActiveId(null)
    lastDragEnd.current = Date.now()
    const target = e.over?.id as Status | undefined
    const jobId = String(e.active.id)
    const current = summaries.find((s) => s.job.id === jobId)?.job.status
    // Dropping back on its own column (or outside any column) changes nothing.
    if (!target || target === current) return
    onMove(jobId, target)
  }

  // A click that is really the end of a drag must not open the job.
  const open = (jobId: string) => {
    if (Date.now() - lastDragEnd.current > 250) onOpen(jobId)
  }

  const active = summaries.find((s) => s.job.id === activeId)

  return (
    <DndContext
      sensors={sensors}
      onDragStart={(e) => setActiveId(String(e.active.id))}
      onDragEnd={onDragEnd}
      onDragCancel={() => setActiveId(null)}
    >
      <div className="flex h-full min-h-0 gap-3 overflow-x-auto pb-2">
        {STATUSES.map((status) => (
          <Column
            key={status}
            status={status}
            items={summaries.filter((s) => s.job.status === status)}
            collapsed={status === 'closed' && !closedOpen}
            onToggle={status === 'closed' ? toggleClosed : undefined}
            onOpen={open}
          />
        ))}
      </div>
      <DragOverlay dropAnimation={null}>{active ? <JobCard summary={active} overlay /> : null}</DragOverlay>
    </DndContext>
  )
}

function Column({
  status,
  items,
  collapsed,
  onToggle,
  onOpen,
}: {
  status: Status
  items: main.JobSummary[]
  collapsed: boolean
  onToggle?: () => void
  onOpen: (jobId: string) => void
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status })
  const ring = isOver ? 'border-accent/60 bg-accent/5' : 'border-line bg-panel/50'

  if (collapsed) {
    return (
      <section ref={setNodeRef} className={`flex w-12 shrink-0 flex-col items-center gap-3 rounded-2xl border py-3 ${ring}`}>
        <button onClick={onToggle} className="text-ink-2 hover:text-ink" title="Show closed jobs" aria-label="Show closed jobs">
          <ChevronLeft size={16} />
        </button>
        <span className="rounded-full bg-white/10 px-1.5 font-mono text-[11px]">{items.length}</span>
        <span className="label-mono [writing-mode:vertical-rl]">{STATUS_LABEL[status]}</span>
      </section>
    )
  }

  return (
    <section ref={setNodeRef} className={`flex w-72 shrink-0 flex-col rounded-2xl border backdrop-blur ${ring}`}>
      <header className="flex items-center gap-2 border-b border-line px-4 py-3">
        <span className={`h-2 w-2 rounded-full ${STATUS_DOT[status]}`} />
        <h3 className="text-xs font-bold tracking-wider uppercase">{STATUS_LABEL[status]}</h3>
        <span className="rounded-full bg-white/10 px-2 font-mono text-[11px] text-ink-2">{items.length}</span>
        {onToggle && (
          <button onClick={onToggle} className="ml-auto text-ink-2 hover:text-ink" title="Collapse" aria-label="Collapse closed jobs">
            <ChevronRight size={16} />
          </button>
        )}
      </header>
      <div className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto p-3">
        {items.map((s) => (
          <DraggableCard key={s.job.id} summary={s} onOpen={onOpen} />
        ))}
        {items.length === 0 && <p className="py-8 text-center font-mono text-[11px] text-ink-3">Drop jobs here</p>}
      </div>
    </section>
  )
}

function DraggableCard({ summary, onOpen }: { summary: main.JobSummary; onOpen: (jobId: string) => void }) {
  const { setNodeRef, listeners, attributes, isDragging } = useDraggable({ id: summary.job.id })
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      onClick={() => onOpen(summary.job.id)}
      className={isDragging ? 'opacity-30' : ''}
    >
      <JobCard summary={summary} />
    </div>
  )
}
