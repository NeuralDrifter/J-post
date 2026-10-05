import { useEffect, useState } from 'react'
import { api } from './api'
import { ListInterviewOptions, type main } from './backend'

// Interview types, interviewer styles and lengths come from the backend
// (interview_options.go). They never change while the app runs, so they're cached.

let cache: main.InterviewOptions | undefined

export function useInterviewOptions(): main.InterviewOptions | undefined {
  const [options, setOptions] = useState(cache)
  useEffect(() => {
    if (cache) return
    void api(ListInterviewOptions()).then((o) => {
      if (!o) return
      cache = o
      setOptions(o)
    })
  }, [])
  return options
}

export function kindLabel(options: main.InterviewOptions | undefined, id: string): string {
  return options?.kinds.find((k) => k.id === id)?.label ?? id
}
