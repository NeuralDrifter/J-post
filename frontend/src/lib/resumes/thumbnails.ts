// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

import { useEffect, useState } from 'react'
import { parseStoredResume } from './document'
import type { LibraryDocument } from './library'
import { firstPageImage } from './pdfjs'
import { renderResumePreview } from './render'

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
  const parsed = parseStoredResume(doc.data)
  if (!parsed.ok) throw new Error(parsed.error)
  const { pdf } = await renderResumePreview(parsed.data)
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
  const [image, setImage] = useState<string>()
  useEffect(() => {
    let cancelled = false
    thumbnailFor(doc).then(
      (url) => !cancelled && setImage(url),
      () => !cancelled && setImage(undefined),
    )
    return () => {
      cancelled = true
    }
  }, [doc])
  return image
}
