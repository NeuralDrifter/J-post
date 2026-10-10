// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const vendorDir = fileURLToPath(new URL('./src/vendor/reactive-resume', import.meta.url))
const linguiShim = fileURLToPath(new URL('./src/vendor/linguiMacro.ts', import.meta.url))

// Reactive Resume's own import names, resolved to the vendored source. Most
// subpaths are file paths; these four are renamed by upstream's export maps.
const reactiveResumeAliases = [
  { find: /^@reactive-resume\/resume\/stylesheet\/types$/, replacement: `${vendorDir}/resume/stylesheet/semantic-types.ts` },
  { find: /^@reactive-resume\/pdf\/semantic-legacy$/, replacement: `${vendorDir}/pdf/semantic/legacy-converter.ts` },
  { find: /^@reactive-resume\/pdf\/semantic-tree$/, replacement: `${vendorDir}/pdf/semantic/tree.ts` },
  { find: /^@reactive-resume\/pdf\/primitives$/, replacement: `${vendorDir}/pdf/forme/primitives.tsx` },
  { find: /^#react-pdf-renderer$/, replacement: `${vendorDir}/pdf/forme/primitives.tsx` },
  { find: /^@reactive-resume\/(.*)$/, replacement: `${vendorDir}/$1` },
  // Vendored messages are English as written (see linguiMacro.ts).
  { find: /^@lingui\/core\/macro$/, replacement: linguiShim },
]

// Upstream's test setup: Node by default, happy-dom for the importers, and its
// 30 s timeout, since the PDF tests render real documents.
function vendorProject(name: string, environment: string, include: string[], exclude: string[]) {
  return { extends: true as const, test: { name, environment, include, exclude, testTimeout: 30_000, setupFiles: ['src/vendor/vitest.setup.ts'] } }
}

// https://vitejs.dev/config/
export default defineConfig({
  // Vendored code skips fast refresh: its runtime needs `window`, and the PDF
  // templates also run inside the render worker, which has none.
  plugins: [react({ exclude: /\/src\/vendor\// }), tailwindcss()],
  resolve: { alias: reactiveResumeAliases },
  // The resume render worker is an ES module (it shares code with the page).
  worker: { format: 'es' },
  test: {
    projects: [
      { extends: true, test: { name: 'app', environment: 'node', include: ['src/**/*.test.ts'], exclude: ['src/vendor/**'] } },
      vendorProject('vendor', 'node', ['src/vendor/**/*.test.{ts,tsx}'], ['src/vendor/reactive-resume/import/**']),
      vendorProject('vendor-import', 'happy-dom', ['src/vendor/reactive-resume/import/**/*.test.{ts,tsx}'], []),
    ],
  },
})
