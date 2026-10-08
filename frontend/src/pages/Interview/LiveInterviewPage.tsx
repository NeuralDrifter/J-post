// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

import { useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import type { app } from '../../lib/backend'
import { peekSession } from '../../lib/interview'
import { kindLabel, useInterviewOptions } from '../../lib/interviewOptions'
import { readPref, writePref } from '../../lib/prefs'
import type { DeviceChoice } from './DeviceCheck'
import { CoachPanel, InterviewHeader, NotRunning, StartPanel, TranscriptView } from './LiveInterviewParts'
import { useLiveInterview } from './useLiveInterview'

const CUES_PREF = 'interviewCues'

export default function LiveInterviewPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const options = useInterviewOptions()
  const [live] = useState<app.LiveSession | undefined>(() => peekSession(id))
  const interview = useLiveInterview(id, live)
  const [showCues, setShowCues] = useState(() => readPref(CUES_PREF, 'true') === 'true')
  const [devices, setDevices] = useState<DeviceChoice>({ micDeviceId: '', outputDeviceId: '' })

  if (!live) return <NotRunning onOpenReview={() => navigate(`/interviews/${id}`)} />

  const toggleCues = () => {
    writePref(CUES_PREF, String(!showCues))
    setShowCues(!showCues)
  }

  return (
    <div className="flex h-full min-h-[520px] flex-col gap-4">
      <InterviewHeader
        title={`Mock interview · ${kindLabel(options, live.kind)}`}
        subtitle={`${live.position} · ${live.company}${interview.started ? ` · with ${live.interviewerName}` : ''}`}
        started={interview.started}
        status={interview.status}
        muted={interview.muted}
        micLevel={interview.micLevel}
        elapsed={interview.elapsed}
        totalMs={live.minutes * 60_000}
        showCues={showCues}
        ending={interview.ending}
        onToggleCues={toggleCues}
        onToggleMute={interview.toggleMute}
        onFinish={interview.finish}
      />

      {interview.status === 'error' && interview.detail && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-danger/40 bg-danger/10 px-4 py-2 text-sm text-rose-200">
          <span className="min-w-0 flex-1">{interview.detail}</span>
          {interview.started && (
            <button className="btn btn-ghost py-1" onClick={interview.reconnect}>
              Reconnect
            </button>
          )}
        </div>
      )}

      {interview.started ? (
        <div className={`grid min-h-0 flex-1 gap-4 ${showCues ? 'min-[1100px]:grid-cols-[minmax(0,1fr)_320px]' : ''}`}>
          <TranscriptView lines={interview.lines} />
          {showCues && <CoachPanel lines={interview.lines} speaking={interview.speaking} elapsed={interview.elapsed} nudges={interview.nudges} />}
        </div>
      ) : (
        <StartPanel devices={devices} onDevicesChange={setDevices} onStart={() => interview.begin(devices)} />
      )}
    </div>
  )
}
