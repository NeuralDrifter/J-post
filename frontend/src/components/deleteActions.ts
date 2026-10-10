// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

import { DeleteJob, DeleteMockInterview, type app } from '../lib/backend'
import { toast } from '../lib/toast'
import { confirmThen } from './ConfirmDialog'

// Deletes offered from more than one place, so each asks the same question.
// Each resolves true once deleted. The caller then calls notifyDataChanged(),
// after leaving the deleted item's page if it was on it, so that page doesn't
// reload something that's gone.

export async function deleteJob(job: app.Job): Promise<boolean> {
  const deleted = await confirmThen(
    {
      title: 'Delete this job?',
      message: `${job.position} at ${job.company} will be permanently deleted, along with its history, contacts, interviews, files and comp packages.`,
      confirmLabel: 'Delete',
    },
    () => DeleteJob(job.id),
  )
  if (deleted) toast.success('Job deleted')
  return deleted
}

export function deleteMockInterview(id: string): Promise<boolean> {
  return confirmThen(
    { title: 'Delete this mock interview?', message: 'The transcript, tips, scorecards and recording will be deleted.', confirmLabel: 'Delete' },
    () => DeleteMockInterview(id),
  )
}
