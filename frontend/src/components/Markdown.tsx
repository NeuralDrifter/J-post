// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

import ReactMarkdown from 'react-markdown'
import { BrowserOpenURL } from '../lib/backend'

/** Renders markdown safely (raw HTML is not rendered); links open in the system browser. */
export function Markdown({ text }: { text: string }) {
  return (
    <div className="markdown text-sm leading-relaxed text-ink-2">
      <ReactMarkdown
        components={{
          a: ({ href, children }) => (
            <a
              href={href}
              onClick={(e) => {
                e.preventDefault()
                if (href) BrowserOpenURL(href)
              }}
            >
              {children}
            </a>
          ),
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  )
}
