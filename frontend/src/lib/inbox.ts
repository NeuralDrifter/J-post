// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

import type { app } from './backend'

/**
 * The postings the Discover list shows. With Only new on, opening a posting
 * marks it seen; `opened` keeps those on screen (like a read email in an unread
 * view) until the view changes, so a click never makes the posting vanish.
 */
export function visiblePostings(postings: app.Posting[], onlyNew: boolean, opened: ReadonlySet<string>): app.Posting[] {
  return onlyNew ? postings.filter((p) => p.state === 'new' || opened.has(p.id)) : postings
}
