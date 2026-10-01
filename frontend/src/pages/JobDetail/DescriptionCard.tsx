import { useState } from 'react'
import { Markdown } from '../../components/Markdown'
import { Panel } from '../../components/Panel'

export function DescriptionCard({ text }: { text: string }) {
  const [open, setOpen] = useState(false)
  if (!text.trim()) return null
  return (
    <Panel
      title="Job description"
      action={
        <button className="text-xs text-ink-2 hover:text-ink" onClick={() => setOpen((o) => !o)}>
          {open ? 'Collapse' : 'Expand'}
        </button>
      }
    >
      <div className={`relative ${open ? '' : 'max-h-56 overflow-hidden'}`}>
        <Markdown text={text} />
        {!open && <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-linear-to-t from-[#131b2e] to-transparent" />}
      </div>
    </Panel>
  )
}
