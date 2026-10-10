# Reactive Resume (vendored)

Name: Reactive Resume
Upstream: https://github.com/reactive-resume/reactive-resume
Commit: b3d8266c5e8f6d8ed8401baa64ceefd912281e7e (2026-10-06)
License: MIT, Copyright (c) 2026 Amruth Pillai (see LICENSE in this folder)

Job Track's resume builder, templates, exporters, importers and ATS checker are
built on this code. Job Track's own screens are new code. Where a screen follows a
Reactive Resume screen's behaviour, its header says so.

## What was taken

Each folder here is upstream's `packages/<name>/src`. Upstream's import names
(`@reactive-resume/<name>/...`, `#react-pdf-renderer`) resolve to them through
the aliases in `frontend/vite.config.ts` and `paths` in `frontend/tsconfig.json`.

| Folder | Upstream package | What it is |
|---|---|---|
| `schema/` | `@reactive-resume/schema` | Resume and cover-letter data model (zod) |
| `resume/` | `@reactive-resume/resume` | Markdown export, JSON patches, stylesheet compiler, ATS rules and PDF analysis |
| `pdf/` | `@reactive-resume/pdf` | Templates and the Forme PDF renderer (browser build) |
| `docx/` | `@reactive-resume/docx` | Word export |
| `import/` | `@reactive-resume/import` | JSON Resume, Reactive Resume v4/v5, LinkedIn and plain-text importers |
| `fonts/` | `@reactive-resume/fonts` | Font catalogue (Google Fonts file list) |
| `utils/` | `@reactive-resume/utils` | Colour, locale, string and style helpers |
| `fixtures/` | `packages/pdf/fixtures` | PDFs the ATS extraction tests read |
| `web/features/resume/editor/write/model.ts` | `apps/web` | The editor's section and entry model: outline order, add/move/remove sections, new entries, drafts |
| `web/features/resume/editor/design/presets.ts` | `apps/web` | Design presets: font pairings, density, margins, text size, accents, Fit to one page |
| `web/features/ats-checker/extract-client.ts` | `apps/web` | Reads a PDF's text layer with pdf.js, for importing PDFs and the ATS check |
| `web/features/ats-checker/run-ats-check.ts` | `apps/web` | Runs the ATS analysis on a PDF, optionally against a job description |
| `web/templates/*.jpg` | `apps/web/public/templates/jpg` | Template preview images |

Not taken: `ai`, `api`, `auth`, `db`, `email`, `env`, `mcp`, `dsh-plugin`, `ui`,
`config`, `apps/server`, and the rest of `apps/web`, which is a behavioural reference
only: Job Track's screens are its own. The `web/` files above (and their tests) are
UI-free logic, kept at their upstream paths.

## Left out

Listed in `tools/vendor_reactive_resume.exclude`.

- Server-only code: `pdf/server.tsx` and `pdf/forme/images.node.ts` (PDF rendering
  and image fetching in Node), `utils/monorepo.node.ts`, `utils/url-security.node.ts`,
  `utils/rate-limit.ts`, with their tests.
- Tests that import the server renderer or rasterise pages with `@napi-rs/canvas`:
  `pdf/forme/export-text`, `pdf/forme/images-security`, `pdf/literal-whitespace`,
  `pdf/paragraph-indent`, `pdf/special-characters`, `pdf/templates/shared/picture-border`,
  `picture-fit`, `page-margins`, `skill-level-alignment`, `pdf/templates/gengar/gengar-skills`,
  and the helper `pdf/semantic/test/rasterize-pdf.ts`.
- Tests that download real fonts from Google Fonts over the network:
  `pdf/unicode-spaces.integration`.

## Local changes

Kept as a patch, `tools/vendor_reactive_resume.patch`, which the sync script applies.
Each changed file also carries `// Modified by Michael P. Burgus, 2026.`

| File | Change | Why |
|---|---|---|
| `resume/stylesheet/values.ts` | `border` shorthand expansion returns `[string, string]` tuples instead of `as const` | TypeScript 5.9 (Job Track) infers a readonly tuple there that upstream's TypeScript 7 accepts |
| `pdf/forme/fonts.ts` | Font files are fetched from `/rr-fonts?src=<url>` instead of the URL itself | Job Track's Go side (`internal/resumes`) downloads each listed font once and serves it offline afterwards |
| `web/features/ats-checker/extract-client.ts` | The pdf.js worker URL comes from a `?url` import | Vite doesn't resolve `new URL('pdfjs-dist/…', import.meta.url)`; the import gives the same worker the preview uses |

## Re-syncing

1. Update `reference/3rd_party/reactive-resume` to the new upstream commit.
2. `bash tools/vendor_reactive_resume.sh reference/3rd_party/reactive-resume`
   (copies, drops the excluded files, adds headers, applies the patch).
3. If the patch no longer applies, redo each change above by hand, then run
   `bash tools/vendor_reactive_resume_patch.sh reference/3rd_party/reactive-resume`
   to rebuild the patch from the vendored tree.
4. Update the commit above, then run `go generate ./...` and `bash tools/verify.sh`.
