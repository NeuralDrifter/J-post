// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

import { useMemo, useRef, useState } from 'react'
import { FileUp } from 'lucide-react'
import { Modal } from '../../components/Modal'
import { Toggle } from '../ResumeBuilder/ui/controls'
import { api } from '../../lib/api'
import { CreateJob, type app } from '../../lib/backend'
import { autoMapHeaders, CSV_FIELD_LABELS, mapCsvToJobs, newJobsOnly, parseCsv, type CsvField } from '../../lib/csvImport'
import { notifyDataChanged } from '../../lib/events'
import { toast } from '../../lib/toast'

const FIELDS = Object.keys(CSV_FIELD_LABELS) as CsvField[]

/** Adds jobs from a CSV file (Job Track's own export, or another tracker's), with each column matched to a field. */
export function ImportJobsModal({ existing, onClose }: { existing: app.Job[]; onClose: () => void }) {
  const fileInput = useRef<HTMLInputElement>(null)
  const [table, setTable] = useState<string[][] | null>(null)
  const [mapping, setMapping] = useState<(CsvField | null)[]>([])
  const [skipExisting, setSkipExisting] = useState(true)
  const [importing, setImporting] = useState(false)

  const read = async (file: File | undefined) => {
    if (!file) return
    try {
      const rows = parseCsv(await file.text())
      if (rows.length < 2) return toast.error('That file has no rows to import.')
      setTable(rows)
      setMapping(autoMapHeaders(rows[0]!))
    } catch {
      toast.error("Couldn't read that file.")
    }
  }

  const result = useMemo(() => (table ? mapCsvToJobs(table, mapping) : null), [table, mapping])
  const toImport = result ? (skipExisting ? newJobsOnly(result.jobs, existing) : result.jobs) : []
  const alreadyThere = result ? result.jobs.length - toImport.length : 0

  const run = async () => {
    setImporting(true)
    let added = 0
    for (const job of toImport) if (await api(CreateJob(job))) added++
    setImporting(false)
    notifyDataChanged()
    toast.success(`Imported ${added} job${added === 1 ? '' : 's'}.`)
    onClose()
  }

  return (
    <Modal title="Import jobs from CSV" onClose={onClose} width="max-w-2xl">
      <div className="space-y-4">
        <p className="text-sm text-ink-2">A spreadsheet with a row per job: Job Track's own export, or one from another tracker. Each job needs a company and a position.</p>
        <button type="button" className="btn btn-ghost" onClick={() => fileInput.current?.click()}>
          <FileUp size={14} /> {table ? 'Choose another file' : 'Choose a .csv file'}
        </button>
        <input ref={fileInput} type="file" accept=".csv,text/csv" hidden onChange={(e) => void read(e.target.files?.[0])} />
        {table && result && (
          <>
            <ColumnMapping headers={table[0]!} sample={table[1] ?? []} mapping={mapping} onChange={setMapping} />
            <Toggle label="Skip jobs already in the pipeline" hint="Same company and position" checked={skipExisting} onChange={setSkipExisting} />
            <p className="text-xs text-ink-3">
              {toImport.length} job{toImport.length === 1 ? '' : 's'} to add
              {result.skipped > 0 && ` · ${result.skipped} row${result.skipped === 1 ? '' : 's'} without a company or position skipped`}
              {alreadyThere > 0 && ` · ${alreadyThere} already in the pipeline`}
            </p>
          </>
        )}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" disabled={toImport.length === 0 || importing} onClick={() => void run()}>
            {importing ? 'Importing…' : `Import ${toImport.length || ''}`.trim()}
          </button>
        </div>
      </div>
    </Modal>
  )
}

type MappingProps = { headers: string[]; sample: string[]; mapping: (CsvField | null)[]; onChange: (mapping: (CsvField | null)[]) => void }

/** Each column of the file, an example value, and the field it goes to (or left out). */
function ColumnMapping({ headers, sample, mapping, onChange }: MappingProps) {
  const set = (index: number, field: CsvField | null) => onChange(mapping.map((current, i) => (i === index ? field : current === field ? null : current)))
  return (
    <div className="max-h-64 overflow-y-auto rounded-xl border border-line">
      <table className="w-full text-xs">
        <thead className="sticky top-0 bg-raised">
          <tr className="text-left text-ink-3">
            <th className="px-3 py-2 font-medium">Column</th>
            <th className="px-3 py-2 font-medium">Example</th>
            <th className="px-3 py-2 font-medium">Goes to</th>
          </tr>
        </thead>
        <tbody>
          {headers.map((header, i) => (
            <tr key={`${i}:${header}`} className="border-t border-line">
              <td className="px-3 py-1.5 font-medium">{header || `Column ${i + 1}`}</td>
              <td className="max-w-48 truncate px-3 py-1.5 text-ink-3">{sample[i]}</td>
              <td className="px-3 py-1.5">
                <select className="field py-1 text-xs" value={mapping[i] ?? ''} onChange={(e) => set(i, (e.target.value || null) as CsvField | null)} aria-label={`Field for ${header}`}>
                  <option value="">Leave out</option>
                  {FIELDS.map((field) => (
                    <option key={field} value={field}>
                      {CSV_FIELD_LABELS[field]}
                    </option>
                  ))}
                </select>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
