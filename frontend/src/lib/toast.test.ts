// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

import { afterEach, describe, expect, it, vi } from 'vitest'
import { currentToasts as current, dismissToast, runToastAction, toast } from './toast'

afterEach(() => current().forEach((t) => dismissToast(t.id)))

describe('toast actions', () => {
  it('shows an action beside the message', () => {
    toast.info('Issue ignored', { label: 'Undo', onClick: () => undefined })
    expect(current().at(-1)).toMatchObject({ message: 'Issue ignored', action: { label: 'Undo' } })
  })

  it('runs the action once and dismisses the toast', () => {
    const undo = vi.fn()
    toast.info('Issue ignored', { label: 'Undo', onClick: undo })
    const shown = current().at(-1)!
    runToastAction(shown)
    runToastAction(shown)
    expect(undo).toHaveBeenCalledTimes(1)
    expect(current()).not.toContainEqual(expect.objectContaining({ id: shown.id }))
  })

  it('stays plain without an action', () => {
    toast.success('Saved')
    expect(current().at(-1)?.action).toBeUndefined()
  })
})
