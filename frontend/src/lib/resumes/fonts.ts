// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

// The font picker's data: which families match a search, their weights, and
// each family's preview face (fetched through the app's font cache).
import { fontList, getFont, getFontDisplayName, getFontSearchKeywords, getWebFont, sortFontWeights, type FontWeight } from '@reactive-resume/fonts'

/** Where the app's font cache answers (see internal/resumes/fontcache.go). */
const FONT_CACHE_PATH = '/rr-fonts'

export type FontChoice = { family: string; label: string; category: string }

/** Families whose name matches the search (all when it's blank), at most `limit`, best matches first. */
export function searchFonts(query: string, limit: number): FontChoice[] {
  const q = query.trim().toLowerCase()
  const ranked = q
    ? fontList
        .map((font) => ({ font, rank: Math.min(...getFontSearchKeywords(font.family).map((k) => matchRank(k.toLowerCase(), q))) }))
        .filter(({ rank }) => rank < NO_MATCH)
        .sort((a, b) => a.rank - b.rank)
        .map(({ font }) => font)
    : fontList
  return ranked.slice(0, limit).map((font) => ({ family: font.family, label: getFontDisplayName(font.family), category: font.category ?? '' }))
}

const NO_MATCH = 4

/** 0 for the exact name, 1 for a name that starts with the search, 2 for a later word that does, 3 for anywhere. */
function matchRank(name: string, query: string): number {
  if (name === query) return 0
  if (name.startsWith(query)) return 1
  if (name.includes(` ${query}`)) return 2
  return name.includes(query) ? 3 : NO_MATCH
}

/** A family's weights, lightest first. */
export function fontWeights(family: string): FontWeight[] {
  return sortFontWeights((getFont(family)?.weights ?? ['400']) as FontWeight[])
}

/** Adds or removes a weight, keeping at least one and keeping them in order. */
export function toggleWeight(weights: readonly FontWeight[], weight: FontWeight): FontWeight[] {
  if (!weights.includes(weight)) return sortFontWeights([...weights, weight])
  return weights.length > 1 ? weights.filter((w) => w !== weight) : [...weights]
}

/** The CSS family a preview of `family` loads as; standard PDF fonts preview in their own (system) name. */
export const previewFamily = (family: string) => (getWebFont(family) ? `${family} Preview` : family)

const loaded = new Map<string, Promise<void>>()

/** Loads a web family's preview face, once; standard fonts need nothing. */
export function loadFontPreview(family: string): Promise<void> {
  const font = getWebFont(family)
  if (!font?.preview) return Promise.resolve()
  let load = loaded.get(family)
  if (!load) {
    const face = new FontFace(previewFamily(family), `url(${FONT_CACHE_PATH}?src=${encodeURIComponent(font.preview)})`, { display: 'swap' })
    load = face.load().then((ready) => void document.fonts.add(ready))
    load.catch(() => loaded.delete(family)) // offline now; may work later
    loaded.set(family, load)
  }
  return load
}
