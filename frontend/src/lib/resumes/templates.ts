// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

import { templateLayouts, templateSchema, type Template } from '@reactive-resume/schema/templates'

export type { Template }

/** Every template, in Reactive Resume's order. */
export const TEMPLATES: readonly Template[] = templateSchema.options

const previewImages = import.meta.glob<string>('../../vendor/reactive-resume/web/templates/*.jpg', {
  eager: true,
  query: '?url',
  import: 'default',
})

/** Reactive Resume's sample image of a template. */
export function templatePreview(template: Template): string {
  return previewImages[`../../vendor/reactive-resume/web/templates/${template}.jpg`] ?? ''
}

/** A short description of a template's layout, for the template picker. */
export function templateTraits(template: Template): string {
  const layout = templateLayouts[template]
  const columns = layout.columns === 1 ? 'One column' : `Two columns, sidebar ${layout.sidebarSide}`
  return layout.atsSafe ? `${columns} · ATS friendly` : columns
}

/** The gallery's filters, as Reactive Resume offers them. */
export type TemplateFilter = 'all' | 'one' | 'two' | 'ats'

export const TEMPLATE_FILTERS: { value: TemplateFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'one', label: 'One column' },
  { value: 'two', label: 'Two columns' },
  { value: 'ats', label: 'ATS-safe' },
]

export function matchesTemplateFilter(template: Template, filter: TemplateFilter): boolean {
  const layout = templateLayouts[template]
  if (filter === 'one') return layout.columns === 1
  if (filter === 'two') return layout.columns === 2
  if (filter === 'ats') return layout.atsSafe
  return true
}

/** "One column · ATS-safe", under a template's card. */
export function templateTags(template: Template): string {
  const layout = templateLayouts[template]
  return [layout.columns === 1 ? 'One column' : 'Two columns', layout.atsSafe ? 'ATS-safe' : null].filter(Boolean).join(' · ')
}

export function isTemplate(value: string): value is Template {
  return (TEMPLATES as readonly string[]).includes(value)
}
