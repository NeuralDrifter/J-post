// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// An effect written as `useEffect(() => expr, deps)` returns expr's value as its
// cleanup. If that value is a Promise (e.g. smooth scrollIntoView in current
// Chromium), React crashes with "destroy is not a function" and the page goes
// blank. Effects must use a block body, or return a cleanup function.
function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) return sources(p)
    return /\.tsx?$/.test(name) && !name.endsWith('.test.ts') ? [p] : []
  })
}

describe('useEffect bodies', () => {
  it('never return a bare expression', () => {
    const offenders = sources(join(import.meta.dirname, '..')).flatMap((file) =>
      readFileSync(file, 'utf8')
        .split('\n')
        .map((line, i) => ({ line, i }))
        .filter(({ line }) => /useEffect\(\s*\(\)\s*=>\s*(?!\{|\(\)\s*=>)\S/.test(line))
        .map(({ i }) => `${file}:${i + 1}`),
    )
    expect(offenders).toEqual([])
  })
})
