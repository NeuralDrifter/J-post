// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

import { findEntry, getEntries, resolveSection } from '@reactive-resume/web/features/resume/editor/write/model'
import { Modal } from '../../../components/Modal'
import { useResume, useUpdate } from '../editorContext'
import { EntryForm } from './EntryForm'
import { FIELD_SETS } from './fieldSets'

/** Edits one entry. Changes apply as you type (and can be undone); Done just closes. */
export function EntryModal({ sectionId, entryId, sectionTitle, onClose }: { sectionId: string; entryId: string; sectionTitle: string; onClose: () => void }) {
  const data = useResume()
  const update = useUpdate()
  const section = resolveSection(data, sectionId)
  const entry = findEntry(data, sectionId, entryId)
  if (!section || !entry) return null

  const setField = (key: string, value: unknown) =>
    update((draft) => {
      const target = getEntries(draft, section).find((e) => e.id === entryId) as Record<string, unknown> | undefined
      if (target) target[key] = value
    })

  return (
    <Modal title={sectionTitle} onClose={onClose} width="max-w-2xl">
      <EntryForm fields={FIELD_SETS[section.type]} values={entry as unknown as Record<string, unknown>} onChange={setField} />
      <div className="mt-6 flex justify-end">
        <button type="button" className="btn btn-primary" onClick={onClose}>
          Done
        </button>
      </div>
    </Modal>
  )
}
