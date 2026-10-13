// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

// Reactive Resume's template gallery in J-POST's style: filters, and cards
// drawn from the author's own content where there is some.
import { useState, type KeyboardEvent } from 'react'
import { Check } from 'lucide-react'
import { templateLabel } from '../../lib/resumes/library'
import type { PrintablePage } from '../../lib/resumes/stored'
import { matchesTemplateFilter, TEMPLATE_FILTERS, TEMPLATES, templatePreview, templateTags, type Template, type TemplateFilter } from '../../lib/resumes/templates'
import { useTemplateThumbnail } from '../../lib/resumes/thumbnails'

type Props = {
  value: Template
  onChange: (template: Template) => void
  columns?: string
  /** The author's content, to draw each card with; without it, cards show Reactive Resume's samples. */
  content?: { page: PrintablePage; key: string }
  /** Hovering or focusing a card previews it on the page; null puts the page back. */
  onPreview?: (template: Template | null) => void
}

export function TemplatePicker({ value, onChange, columns = 'grid-cols-[repeat(auto-fill,minmax(132px,1fr))]', content, onPreview }: Props) {
  const [filter, setFilter] = useState<TemplateFilter>('all')
  const shown = TEMPLATES.filter((t) => matchesTemplateFilter(t, filter))
  const preview = (template: Template | null) => onPreview?.(template === value ? null : template)
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') preview(null)
  }
  return (
    <div className="space-y-3">
      <div role="radiogroup" aria-label="Show templates" className="flex flex-wrap items-center gap-1.5">
        {TEMPLATE_FILTERS.map((option) => (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={filter === option.value}
            onClick={() => setFilter(option.value)}
            className={`rounded-full border px-2.5 py-0.5 text-xs transition ${filter === option.value ? 'border-accent bg-accent/20 font-medium text-indigo-100' : 'border-line-strong text-ink-2 hover:bg-white/5'}`}
          >
            {option.label}
          </button>
        ))}
        <span className="ml-auto text-[11px] text-ink-3">
          {shown.length} of {TEMPLATES.length}
        </span>
      </div>
      <div role="radiogroup" aria-label="Template" className={`grid gap-3 ${columns}`} onPointerLeave={() => preview(null)} onKeyDown={onKeyDown}>
        {shown.map((template) => (
          <TemplateOption key={template} template={template} selected={template === value} content={content} onPreview={() => preview(template)} onSelect={() => onChange(template)} />
        ))}
      </div>
    </div>
  )
}

type OptionProps = { template: Template; selected: boolean; content: Props['content']; onPreview: () => void; onSelect: () => void }

function TemplateOption({ template, selected, content, onPreview, onSelect }: OptionProps) {
  const thumbnail = useTemplateThumbnail(template, content?.page, content?.key ?? '')
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      onPointerEnter={onPreview}
      onFocus={onPreview}
      className="group text-left"
    >
      <span
        className={`relative block overflow-hidden rounded-xl border transition group-hover:-translate-y-0.5 ${
          selected ? 'border-accent shadow-[0_0_0_3px_rgb(99_102_241/0.25)]' : 'border-line group-hover:border-line-strong'
        }`}
      >
        <img src={thumbnail ?? templatePreview(template)} alt="" loading="lazy" className="aspect-[1/1.414] w-full bg-white object-cover object-top" />
        {selected && (
          <span className="absolute top-1.5 right-1.5 grid size-5 place-items-center rounded-full bg-accent text-white">
            <Check size={12} />
          </span>
        )}
      </span>
      <span className="mt-1.5 block text-xs font-medium">{templateLabel(template)}</span>
      <span className="block text-[11px] text-ink-3">{templateTags(template)}</span>
    </button>
  )
}
