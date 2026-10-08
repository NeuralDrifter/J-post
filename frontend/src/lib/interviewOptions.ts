// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

import { ListInterviewOptions, type app } from './backend'
import { useStaticData } from './staticData'

// Interview types, interviewer styles and lengths come from the backend
// (interview_options.go).

export function useInterviewOptions(): app.InterviewOptions | undefined {
  return useStaticData('interviewOptions', ListInterviewOptions)
}

export function kindLabel(options: app.InterviewOptions | undefined, id: string): string {
  return options?.kinds.find((k) => k.id === id)?.label ?? id
}
