// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

/** The options for a model dropdown: the loaded models, plus the current one if the server no longer lists it. */
export function modelChoices(models: string[], current: string): string[] {
  return current && !models.includes(current) ? [current, ...models] : models
}

/** The toast after a provider's Test button succeeds, e.g. "DeepSeek answered in 1.2 s (deepseek-chat)". */
export function formatTestResult(label: string, result: { model: string; millis: number }): string {
  const text = `${label} answered in ${(result.millis / 1000).toFixed(1)} s`
  return result.model ? `${text} (${result.model})` : text
}
