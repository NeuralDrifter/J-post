// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

// Reads resumes and letters from the files people have. What a file holds is
// read from its bytes and shape, as Reactive Resume does it
// (apps/web/src/features/resume/import/read-file.ts, MIT); everything is read
// on this computer.
import { strFromU8, unzipSync } from 'fflate'
import { parseJSONResume } from '@reactive-resume/import/json-resume'
import { parseResumeText } from '@reactive-resume/import/plain-text'
import { parseReactiveResumeJSON } from '@reactive-resume/import/reactive-resume-json'
import { parseReactiveResumeV4JSON } from '@reactive-resume/import/reactive-resume-v4-json'
import { convertLegacyStylesheet, needsLegacyStyleConversion } from '@reactive-resume/pdf/semantic-legacy'
import { detachEmbeddedLetters } from '@reactive-resume/resume/cover-letter'
import { coverLetterDocumentSchema } from '@reactive-resume/schema/cover-letter/data'
import { forEachDatedEntry } from '@reactive-resume/schema/resume/dates'
import type { ResumeData } from './document'
import { newLetterData, type LetterData } from './letter'

export type ImportKind = 'pdf' | 'docx' | 'linkedin' | 'reactive-resume-json' | 'reactive-resume-v4-json' | 'json-resume-json' | 'cover-letter-json'

/** A resume import; `sourceText` is the file's text when it was read line by line (PDF, Word), else ''. */
export type ImportResult = { kind: 'resume'; data: ResumeData; letters: LetterData[]; sourceText: string } | { kind: 'letter'; letter: LetterData }

/** An import failure worded for the person importing. */
export class ImportError extends Error {}

const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46] // "%PDF"
const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04] // "PK\x03\x04"
const OLE_MAGIC = [0xd0, 0xcf, 0x11, 0xe0] // legacy .doc

const startsWith = (bytes: Uint8Array, magic: number[]) => magic.every((byte, i) => bytes[i] === byte)

/** What a file holds; throws ImportError (with advice) for files this app can't read. */
export function detectImportKind(name: string, bytes: Uint8Array): ImportKind {
  const lower = name.toLowerCase()
  if (startsWith(bytes, PDF_MAGIC)) return 'pdf'
  if (startsWith(bytes, OLE_MAGIC) || lower.endsWith('.doc')) {
    throw new ImportError("Old Word files (.doc) can't be read. Open it in Word and save it as .docx, then import that.")
  }
  if (startsWith(bytes, ZIP_MAGIC)) return zipKind(bytes)
  const kind = jsonKind(bytes)
  if (!kind) throw new ImportError("This isn't a resume or letter this app can read: try a PDF, Word (.docx), LinkedIn export (.zip) or resume JSON file.")
  return kind
}

/** Word documents and LinkedIn exports are both zips: their contents tell them apart. */
function zipKind(bytes: Uint8Array): ImportKind {
  const names = zipEntryNames(bytes)
  if (names.includes('word/document.xml')) return 'docx'
  if (names.includes('account.json')) {
    throw new ImportError('This is a Reactive Resume account archive. Extract it, then import a JSON file from its resumes or letters folder.')
  }
  return 'linkedin'
}

function zipEntryNames(bytes: Uint8Array): string[] {
  const names: string[] = []
  try {
    unzipSync(bytes, { filter: (entry) => (names.push(entry.name), false) })
  } catch {
    throw new ImportError("This zip file is damaged and can't be opened.")
  }
  return names
}

/** Several formats share .json; their shape tells them apart (as upstream's detectJsonImportKind). */
function jsonKind(bytes: Uint8Array): ImportKind | null {
  const parsed = parseJsonBytes(bytes)
  return parsed === undefined ? null : jsonShapeKind(parsed)
}

function parseJsonBytes(bytes: Uint8Array): unknown {
  try {
    return JSON.parse(strFromU8(bytes))
  } catch {
    return undefined
  }
}

function jsonShapeKind(parsed: unknown): ImportKind | null {
  if (!parsed || typeof parsed !== 'object') return null
  const data = parsed as Record<string, unknown>
  if (data.format === 'reactive-resume-cover-letter') return 'cover-letter-json'
  if ('basics' in data && !('sections' in data) && !('metadata' in data)) return 'json-resume-json'
  if (!('sections' in data) && !('metadata' in data)) return null
  // Version 4 stored the layout as nested arrays and had no page settings.
  const metadata = data.metadata as Record<string, unknown> | undefined
  return metadata && (Array.isArray(metadata.layout) || !('page' in metadata)) ? 'reactive-resume-v4-json' : 'reactive-resume-json'
}

/** Reads a file into a resume (with any letters an older export carried) or a letter. */
export async function readImport(name: string, bytes: Uint8Array): Promise<ImportResult> {
  const kind = detectImportKind(name, bytes)
  if (kind === 'cover-letter-json') return { kind: 'letter', letter: coverLetterDocumentSchema.parse(JSON.parse(strFromU8(bytes))) }
  if (kind === 'pdf' || kind === 'docx') {
    const sourceText = await TEXT_READERS[kind](name, bytes)
    const data = parseResumeText(sourceText)
    return { kind: 'resume', data, letters: splitOutLetters(data), sourceText }
  }
  const data = await READERS[kind](bytes)
  return { kind: 'resume', data, letters: splitOutLetters(data), sourceText: '' }
}

type StructuredKind = Exclude<ImportKind, 'cover-letter-json' | 'pdf' | 'docx'>

/** Files that carry a resume's structure. */
const READERS: Record<StructuredKind, (bytes: Uint8Array) => ResumeData | Promise<ResumeData>> = {
  'json-resume-json': (bytes) => parseJSONResume(strFromU8(bytes)),
  'reactive-resume-json': (bytes) => withLegacyStylesConverted(parseReactiveResumeJSON(strFromU8(bytes))),
  'reactive-resume-v4-json': (bytes) => parseReactiveResumeV4JSON(strFromU8(bytes)),
  linkedin: async (bytes) => (await import('@reactive-resume/import/linkedin')).parseLinkedInExport(bytes),
}

/** Files read as text, line by line; the structure is guessed from the lines. */
const TEXT_READERS: Record<'pdf' | 'docx', (name: string, bytes: Uint8Array) => string | Promise<string>> = {
  docx: (_, bytes) => docxText(bytes),
  pdf: (name, bytes) => pdfText(name, bytes),
}

// Exports from before Semantic CSS carry style rules nothing renders any more: they come in converted.
function withLegacyStylesConverted(data: ResumeData): ResumeData {
  return needsLegacyStyleConversion(data.metadata) ? { ...data, metadata: { ...data.metadata, stylesheet: convertLegacyStylesheet(data) } } : data
}

async function pdfText(name: string, bytes: Uint8Array): Promise<string> {
  const [{ extractPdf }, { buildExtractedDocument }, { documentToLines }] = await Promise.all([
    import('@reactive-resume/web/features/ats-checker/extract-client'),
    import('@reactive-resume/resume/ats-pdf'),
    import('@reactive-resume/import/pdf-lines'),
  ])
  const lines = documentToLines(buildExtractedDocument(await extractPdf(new File([bytes as Uint8Array<ArrayBuffer>], name), { operatorBudgetMs: 0 })))
  if (lines.length === 0) throw new ImportError("This PDF is a scanned image, so there's no text to read. Try the Word version, or start blank.")
  return lines.join('\n')
}

/** A Word document's text, one paragraph per line. */
export function docxText(bytes: Uint8Array): string {
  const xml = unzipSync(bytes, { filter: (entry) => entry.name === 'word/document.xml' })['word/document.xml']
  if (!xml) throw new ImportError("This Word file has no document inside it.")
  return strFromU8(xml)
    .split(/<\/w:p>/)
    .map((paragraph) => [...paragraph.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g)].map((m) => unescapeXml(m[1] ?? '')).join(''))
    .filter((line) => line.trim())
    .join('\n')
}

const XML_ENTITIES: Record<string, string> = { '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'", '&amp;': '&' }

function unescapeXml(text: string): string {
  return text.replace(/&(lt|gt|quot|apos|amp);/g, (entity) => XML_ENTITIES[entity] ?? entity)
}

/** Older resumes carried cover letters inside them; they come out as letters of their own. */
function splitOutLetters(data: ResumeData): LetterData[] {
  return detachEmbeddedLetters(data).map((embedded) => ({
    ...newLetterData(data),
    name: embedded.title || 'Cover letter',
    layout: 'freeform',
    recipient: embedded.recipient,
    content: embedded.content,
  }))
}

/** What an import found: sections with content, their entries, and dates that need a look. */
export function summarizeImport(data: ResumeData): { sections: number; entries: number; datesToCheck: number } {
  const filled = [...Object.values(data.sections), ...data.customSections].filter((section) => section.items.length > 0)
  const hasSummary = data.summary.content.replace(/<[^>]*>/g, '').trim() !== ''
  let datesToCheck = 0
  forEachDatedEntry(data, (entry) => {
    if (entry.dates?.raw) datesToCheck++
  })
  return { sections: filled.length + (hasSummary ? 1 : 0), entries: filled.reduce((n, s) => n + s.items.length, 0), datesToCheck }
}
