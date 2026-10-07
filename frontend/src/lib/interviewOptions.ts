import { ListInterviewOptions, type main } from './backend'
import { useStaticData } from './staticData'

// Interview types, interviewer styles and lengths come from the backend
// (interview_options.go).

export function useInterviewOptions(): main.InterviewOptions | undefined {
  return useStaticData('interviewOptions', ListInterviewOptions)
}

export function kindLabel(options: main.InterviewOptions | undefined, id: string): string {
  return options?.kinds.find((k) => k.id === id)?.label ?? id
}
