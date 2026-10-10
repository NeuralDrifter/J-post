// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

import { useRef, useState, type DragEvent, type SubmitEvent } from 'react'
import { FileUp, LoaderCircle } from 'lucide-react'
import { Field } from '../../components/Field'
import { Modal } from '../../components/Modal'
import type { app } from '../../lib/backend'
import { saveImport } from '../../lib/resumes/actions'
import { readImport, summarizeImport, type ImportResult } from '../../lib/resumes/importFile'

const ACCEPTED = '.pdf,.docx,.doc,.json,.zip'

type Read = { result: ImportResult; suggestedName: string }

/** Imports a resume or letter: pick a file, see what was found, name it, create it. */
export function ImportModal({ onClose, onImported }: { onClose: () => void; onImported: (doc: app.Document) => void }) {
  const [read, setRead] = useState<Read | null>(null)
  const [reading, setReading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const readFile = async (file: File) => {
    setReading(true)
    setError(null)
    try {
      const result = await readImport(file.name, new Uint8Array(await file.arrayBuffer()))
      setRead({ result, suggestedName: suggestName(result, file.name) })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setReading(false)
    }
  }

  return (
    <Modal title="Import" onClose={onClose}>
      {read ? (
        <ConfirmImport read={read} onBack={() => setRead(null)} onImported={onImported} />
      ) : (
        <PickFile reading={reading} error={error} onFile={readFile} />
      )}
    </Modal>
  )
}

/** The person's name for a resume, else the file's name without its extension. */
function suggestName(result: ImportResult, fileName: string): string {
  const person = result.kind === 'resume' ? result.data.basics.name.trim() : ''
  return person || fileName.replace(/\.[^.]+$/, '')
}

function PickFile({ reading, error, onFile }: { reading: boolean; error: string | null; onFile: (file: File) => void }) {
  const input = useRef<HTMLInputElement>(null)
  const [over, setOver] = useState(false)
  const drop = (e: DragEvent) => {
    e.preventDefault()
    setOver(false)
    const file = e.dataTransfer.files[0]
    if (file) onFile(file)
  }
  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={() => input.current?.click()}
        onDragOver={(e) => {
          e.preventDefault()
          setOver(true)
        }}
        onDragLeave={() => setOver(false)}
        onDrop={drop}
        disabled={reading}
        className={`grid w-full place-items-center rounded-2xl border border-dashed p-8 text-center transition ${over ? 'border-accent bg-accent/10' : 'border-line-strong hover:border-accent/60'}`}
      >
        {reading ? <LoaderCircle size={26} className="mb-2 animate-spin text-indigo-300" /> : <FileUp size={26} className="mb-2 text-indigo-300" />}
        <span className="text-sm font-semibold">{reading ? 'Reading…' : 'Choose a file, or drop it here'}</span>
        <span className="mt-1 text-xs text-ink-3">PDF, Word (.docx), a LinkedIn data export (.zip), JSON Resume or Reactive Resume JSON</span>
      </button>
      <input ref={input} type="file" accept={ACCEPTED} hidden onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
      {error && (
        <p role="alert" className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-rose-200">
          {error}
        </p>
      )}
      <p className="text-xs text-ink-3">Files are read on this computer. Only a photo linked from the web is downloaded.</p>
    </div>
  )
}

function ConfirmImport({ read, onBack, onImported }: { read: Read; onBack: () => void; onImported: (doc: app.Document) => void }) {
  const [name, setName] = useState(read.suggestedName)
  const [saving, setSaving] = useState(false)
  const submit = async (e: SubmitEvent) => {
    e.preventDefault()
    setSaving(true)
    const doc = await saveImport(read.result, name.trim())
    setSaving(false)
    if (doc) onImported(doc)
  }
  return (
    <form onSubmit={submit} className="space-y-4">
      <ImportSummary result={read.result} />
      <Field label="Name">
        <input className="field" value={name} onChange={(e) => setName(e.target.value)} autoFocus required />
      </Field>
      <div className="flex justify-end gap-2">
        <button type="button" className="btn btn-ghost" onClick={onBack}>
          Choose another file
        </button>
        <button type="submit" className="btn btn-primary" disabled={saving || !name.trim()}>
          {saving ? 'Importing…' : 'Import'}
        </button>
      </div>
    </form>
  )
}

function ImportSummary({ result }: { result: ImportResult }) {
  if (result.kind === 'letter') return <p className="text-sm text-ink-2">A cover letter, ready to import.</p>
  const { sections, entries, datesToCheck } = summarizeImport(result.data)
  const lines = [
    `Found ${sections} section${sections === 1 ? '' : 's'} with ${entries} entr${entries === 1 ? 'y' : 'ies'}.`,
    datesToCheck > 0 ? `${datesToCheck} date${datesToCheck === 1 ? '' : 's'} couldn't be read exactly and will print as written until you check ${datesToCheck === 1 ? 'it' : 'them'}.` : '',
    result.letters.length > 0 ? `It also holds ${result.letters.length} cover letter${result.letters.length === 1 ? '' : 's'}, which will be imported as letters.` : '',
  ].filter(Boolean)
  return (
    <div className="space-y-1 rounded-xl border border-line bg-white/[0.03] px-3 py-2.5 text-sm text-ink-2">
      {lines.map((line) => (
        <p key={line}>{line}</p>
      ))}
    </div>
  )
}
