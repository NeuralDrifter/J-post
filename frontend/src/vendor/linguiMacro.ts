// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

// Vendored Reactive Resume code writes its messages as t`…` (Lingui). Job Track
// is English-only, so `@lingui/core/macro` resolves here and each message reads
// as written, with its values in place.

export function t(strings: TemplateStringsArray, ...values: unknown[]): string {
  return strings.reduce((text, part, i) => text + part + (i < values.length ? String(values[i]) : ''), '')
}
