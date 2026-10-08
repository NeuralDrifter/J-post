// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

import { useEffect, useState } from 'react'
import { api } from './api'

// Backend data that never changes while the app runs: board labels, dataset
// credits, interview choices. Each key is fetched once and shared by every
// component that asks for it. This is the app's only such cache, on purpose.

const loaded = new Map<string, unknown>()
const inFlight = new Map<string, Promise<unknown>>()

function fetchOnce<T>(key: string, load: () => Promise<T>): Promise<T | undefined> {
  let request = inFlight.get(key) as Promise<T | undefined> | undefined
  if (!request) {
    // One request (and at most one error toast) however many components mount at once.
    request = api(load()).then((value) => {
      inFlight.delete(key) // a failure is retried by the next component that mounts
      if (value !== undefined) loaded.set(key, value)
      return value
    })
    inFlight.set(key, request)
  }
  return request
}

/** The value for key, loading it the first time any component asks. */
export function useStaticData<T>(key: string, load: () => Promise<T>): T | undefined {
  const [value, setValue] = useState(() => loaded.get(key) as T | undefined)
  useEffect(() => {
    if (loaded.has(key)) return
    let cancelled = false
    void fetchOnce(key, load).then((v) => {
      if (!cancelled && v !== undefined) setValue(v)
    })
    return () => {
      cancelled = true
    }
    // load is the same backend call for a given key
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  return value
}
