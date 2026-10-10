// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

import type { ReactNode } from 'react'
import { Code2, LayoutTemplate, NotebookPen, Palette, PanelsTopLeft, Ruler, Type, type LucideIcon } from 'lucide-react'
import { TemplatePicker } from '../../Resumes/TemplatePicker'
import { useResume, useUpdate } from '../editorContext'
import { Fold } from '../ui/controls'
import { ColorsSection } from './ColorsSection'
import { CustomCssSection } from './CustomCssSection'
import { LayoutSection } from './LayoutSection'
import { PageSection } from './PageSection'
import { TypographySection } from './TypographySection'

/** How the resume looks: template, layout, type, colour, page and custom CSS, plus private notes. */
export function DesignPanel() {
  return (
    <div className="space-y-2.5">
      <DesignFold title="Template" icon={LayoutTemplate} defaultOpen>
        <TemplateSection />
      </DesignFold>
      <DesignFold title="Layout" icon={PanelsTopLeft}>
        <LayoutSection />
      </DesignFold>
      <DesignFold title="Typography" icon={Type}>
        <TypographySection />
      </DesignFold>
      <DesignFold title="Colours" icon={Palette}>
        <ColorsSection />
      </DesignFold>
      <DesignFold title="Page" icon={Ruler}>
        <PageSection />
      </DesignFold>
      <DesignFold title="Custom CSS" icon={Code2}>
        <CustomCssSection />
      </DesignFold>
      <DesignFold title="Notes" icon={NotebookPen}>
        <NotesSection />
      </DesignFold>
    </div>
  )
}

function DesignFold({ title, icon: Icon, defaultOpen, children }: { title: string; icon: LucideIcon; defaultOpen?: boolean; children: ReactNode }) {
  return (
    <Fold title={title} icon={<Icon size={15} className="shrink-0 text-indigo-300" />} defaultOpen={defaultOpen}>
      {children}
    </Fold>
  )
}

function TemplateSection() {
  const template = useResume().metadata.template
  const update = useUpdate()
  return <TemplatePicker value={template} onChange={(t) => update((d) => void (d.metadata.template = t))} columns="grid-cols-2" />
}

function NotesSection() {
  const notes = useResume().metadata.notes
  const update = useUpdate()
  return (
    <label className="block space-y-1.5">
      <span className="text-xs text-ink-3">Private: never printed.</span>
      <textarea className="field min-h-32 resize-y" value={notes} onChange={(e) => update((d) => void (d.metadata.notes = e.target.value))} aria-label="Notes" />
    </label>
  )
}
