import { describe, expect, it } from 'vitest'
import { filterLicenses, type LicenseEntry } from './filter'

const entries: LicenseEntry[] = [
  { name: 'react', version: '18.3.1', license: 'MIT', url: '', text: '' },
  { name: 'github.com/openai/openai-go/v3', version: 'v3.73.0', license: 'Apache-2.0', url: '', text: '' },
  { name: '@fontsource/jetbrains-mono', version: '5.3.0', license: 'OFL-1.1', url: '', text: '' },
]

describe('filterLicenses', () => {
  it('returns everything for an empty query', () => {
    expect(filterLicenses(entries, '  ')).toHaveLength(3)
  })

  it('matches the name, ignoring case', () => {
    expect(filterLicenses(entries, 'OpenAI').map((e) => e.name)).toEqual(['github.com/openai/openai-go/v3'])
  })

  it('matches the license ID', () => {
    expect(filterLicenses(entries, 'ofl').map((e) => e.name)).toEqual(['@fontsource/jetbrains-mono'])
  })

  it('returns nothing when nothing matches', () => {
    expect(filterLicenses(entries, 'zzz')).toEqual([])
  })
})
