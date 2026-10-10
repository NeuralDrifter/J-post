// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

import { Check } from 'lucide-react'
import { templateLabel } from '../../lib/resumes/library'
import { TEMPLATES, templatePreview, templateTraits, type Template } from '../../lib/resumes/templates'

/** A grid of Reactive Resume's templates with their sample pages; the chosen one is outlined. */
export function TemplatePicker({ value, onChange, columns = 'grid-cols-[repeat(auto-fill,minmax(132px,1fr))]' }: { value: Template; onChange: (t: Template) => void; columns?: string }) {
  return (
    <div role="radiogroup" aria-label="Template" className={`grid gap-3 ${columns}`}>
      {TEMPLATES.map((template) => (
        <TemplateOption key={template} template={template} selected={template === value} onSelect={() => onChange(template)} />
      ))}
    </div>
  )
}

function TemplateOption({ template, selected, onSelect }: { template: Template; selected: boolean; onSelect: () => void }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      title={templateTraits(template)}
      className={`group relative overflow-hidden rounded-xl border text-left transition ${
        selected ? 'border-accent shadow-[0_0_0_3px_rgb(99_102_241/0.25)]' : 'border-line hover:border-line-strong'
      }`}
    >
      <img src={templatePreview(template)} alt="" loading="lazy" className="aspect-[1/1.414] w-full bg-white object-cover object-top transition group-hover:brightness-105" />
      <span className="flex items-center justify-between gap-1 bg-base/90 px-2 py-1.5 text-xs font-medium">
        {templateLabel(template)}
        {selected && <Check size={13} className="text-accent" />}
      </span>
    </button>
  )
}
