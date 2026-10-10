// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

import { useState } from 'react'
import { useNavigate } from 'react-router'
import { FolderOpen, Mic, Trash2 } from 'lucide-react'
import { Chip } from '../../components/Chip'
import { deleteMockInterview } from '../../components/deleteActions'
import { InterviewSetupModal } from '../../components/interview/InterviewSetupModal'
import { Panel } from '../../components/Panel'
import { api } from '../../lib/api'
import { ListMockInterviews, type app } from '../../lib/backend'
import { notifyDataChanged } from '../../lib/events'
import { formatDateTime } from '../../lib/format'
import { averageScore } from '../../lib/interview'
import { kindLabel, useInterviewOptions } from '../../lib/interviewOptions'
import { openMenu } from '../../lib/menu'
import { useLoad } from '../../lib/useLoad'

export function MockInterviewsPanel({ job }: { job: app.Job }) {
  const navigate = useNavigate()
  const options = useInterviewOptions()
  const { data: sessions } = useLoad(() => api(ListMockInterviews(job.id)), [job.id])
  const [setup, setSetup] = useState(false)

  const remove = async (m: app.MockInterview) => {
    if (await deleteMockInterview(m.id)) notifyDataChanged()
  }

  return (
    <Panel title="Mock interviews">
      {sessions?.length ? (
        <ul className="mb-3 space-y-1.5">
          {sessions.map((m) => {
            const avg = averageScore(m.scorecard?.overall)
            return (
              <li
                key={m.id}
                onContextMenu={(e) =>
                  openMenu(e, [
                    { label: 'Open review', icon: FolderOpen, onSelect: () => navigate(`/interviews/${m.id}`) },
                    'separator',
                    { label: 'Delete', icon: Trash2, danger: true, onSelect: () => remove(m) },
                  ])
                }
              >
                <button
                  className="flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-white/5"
                  onClick={() => navigate(`/interviews/${m.id}`)}
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm">
                      {kindLabel(options, m.kind)}
                      {m.interviewerName && <span className="text-ink-3"> · {m.interviewerName}</span>}
                    </span>
                    <span className="block font-mono text-[11px] text-ink-3">{formatDateTime(m.startedAt)}</span>
                  </span>
                  {avg !== undefined ? <Chip tone={avg >= 4 ? 'success' : avg >= 3 ? 'info' : 'warn'}>{avg} / 5</Chip> : <Chip>{m.status}</Chip>}
                </button>
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="mb-3 text-xs text-ink-3">Practice with a voice interviewer that knows this job and your resume.</p>
      )}
      <button className="btn btn-primary w-full py-1.5 text-xs" onClick={() => setSetup(true)}>
        <Mic size={14} /> Start mock interview
      </button>
      {setup && <InterviewSetupModal job={job} onClose={() => setSetup(false)} />}
    </Panel>
  )
}
