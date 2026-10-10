// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

import { FileDown, FileJson, FileType2 } from 'lucide-react'
import type { MenuEntry } from '../../lib/menu'
import type { ExportFormat } from '../../lib/resumes/actions'

/** The Export choices every document offers; `run` exports in the chosen format. */
export function exportMenuItems(run: (format: ExportFormat) => unknown, pdfShortcut?: string): MenuEntry[] {
  return [
    { label: 'PDF', icon: FileDown, shortcut: pdfShortcut, onSelect: () => run('pdf') },
    { label: 'Word (.docx)', icon: FileType2, onSelect: () => run('docx') },
    { label: 'JSON (Reactive Resume)', icon: FileJson, onSelect: () => run('json') },
  ]
}
