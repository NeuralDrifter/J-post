// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

import { useEffect, useState } from 'react'
import type { Template } from './document'
import type { LibraryDocument } from './library'
import { firstPageImage } from './pdfjs'
import { renderResumePreview } from './render'
import { readStoredDocument, type PrintablePage } from './stored'

/** Card thumbnails are drawn at twice their on-screen width so they stay sharp. */
const THUMBNAIL_WIDTH = 360

// Thumbnails render one at a time, so a library of many resumes never stalls the page.
const cache = new Map<string, Promise<string>>()
let queue: Promise<unknown> = Promise.resolve()

function enqueue<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(task)
  queue = run.catch(() => undefined)
  return run
}

async function renderThumbnail(doc: LibraryDocument): Promise<string> {
  const stored = readStoredDocument(doc)
  if ('error' in stored) throw new Error(stored.error)
  const { pdf } = await renderResumePreview(stored.page.data, stored.page.renderOptions)
  return firstPageImage(pdf, THUMBNAIL_WIDTH)
}

/** The first page of a document as an image, re-rendered only when the document changes. */
function thumbnailFor(doc: LibraryDocument): Promise<string> {
  const key = `${doc.id}@${doc.updatedAt}`
  let image = cache.get(key)
  if (!image) {
    image = enqueue(() => renderThumbnail(doc))
    image.catch(() => cache.delete(key)) // a failed render may work next time
    cache.set(key, image)
  }
  return image
}

/** The document's thumbnail once rendered; undefined until then or if it can't be drawn. */
export function useThumbnail(doc: LibraryDocument): string | undefined {
  return useImage(() => thumbnailFor(doc), [doc])
}

/** Template thumbnails of one content, per template; a newer content replaces them all. */
let templateContent: { key: string; images: Map<Template, Promise<string>> } = { key: '', images: new Map() }

/**
 * The first page of `page` drawn in `template`: the gallery shows what the author's own resume
 * would look like. `contentKey` names the content, so thumbnails are drawn once per change.
 */
function templateThumbnailFor(template: Template, page: PrintablePage, contentKey: string): Promise<string> {
  if (templateContent.key !== contentKey) templateContent = { key: contentKey, images: new Map() }
  const { images } = templateContent
  let image = images.get(template)
  if (!image) {
    const data = { ...page.data, metadata: { ...page.data.metadata, template } }
    image = enqueue(async () => {
      // Content edited while this waited in the queue: don't draw a stale page.
      if (templateContent.key !== contentKey) throw new Error('superseded')
      return firstPageImage((await renderResumePreview(data, page.renderOptions)).pdf, THUMBNAIL_WIDTH)
    })
    image.catch(() => images.delete(template))
    images.set(template, image)
  }
  return image
}

/** A template's thumbnail with the author's content; undefined until drawn (show the sample meanwhile). */
export function useTemplateThumbnail(template: Template, page: PrintablePage | undefined, contentKey: string): string | undefined {
  return useImage(() => (page ? templateThumbnailFor(template, page, contentKey) : Promise.reject(new Error('no content'))), [template, contentKey])
}

/** An image that loads asynchronously; undefined until it does, or if it fails. */
function useImage(load: () => Promise<string>, deps: unknown[]): string | undefined {
  const [image, setImage] = useState<string>()
  useEffect(() => {
    let cancelled = false
    load().then(
      (url) => !cancelled && setImage(url),
      () => !cancelled && setImage(undefined),
    )
    return () => {
      cancelled = true
    }
    // `load` is a new function each render; `deps` say when it changes.
  }, deps)
  return image
}
