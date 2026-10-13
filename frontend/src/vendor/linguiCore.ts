// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

// Upstream's tests switch Lingui to English before running; J-POST is
// English-only (see linguiMacro.ts), so loading and activating do nothing.
export const i18n = {
  load: (_locale: string, _messages: Record<string, unknown>) => undefined,
  activate: (_locale: string) => undefined,
  loadAndActivate: (_options: { locale: string; messages: Record<string, unknown> }) => undefined,
}
