// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

import { create } from 'zustand'
import type { EditorSelection } from './viewStore'

type StylePick = {
  /** While set, the next block clicked on the page goes to Custom CSS instead of opening it for editing. */
  onPick: ((target: EditorSelection) => void) | null
  setOnPick: (onPick: ((target: EditorSelection) => void) | null) => void
}

/** "Pick on page" for Custom CSS: one click on the page aims the stylesheet at that block. */
export const useStylePick = create<StylePick>()((set) => ({
  onPick: null,
  setOnPick: (onPick) => set({ onPick }),
}))
