// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

import { createContext, useContext, useEffect, type ReactNode } from 'react'
import type { SectionReview } from '../../../lib/resumes/ai/review'
import { useSectionReviews, type AIDocument } from './aiDocument'
import { useAIReview } from './reviewStore'

// `any`: one context serves resumes and letters; useReview gives each its own type back.
type Value = { doc: AIDocument<any>; reviews: SectionReview<any>[] }

const ReviewContext = createContext<Value | null>(null)

/** Loads the open document's AI runs and works out their changes once, for every section that shows them. */
export function AIReviewProvider<T>({ doc, children }: { doc: AIDocument<T>; children: ReactNode }) {
  useEffect(() => {
    void useAIReview.getState().load(doc.docId)
    return () => useAIReview.getState().reset()
  }, [doc.docId])
  const reviews = useSectionReviews(doc)
  return <ReviewContext value={{ doc, reviews }}>{children}</ReviewContext>
}

export function useReview<T>(): { doc: AIDocument<T>; reviews: SectionReview<T>[] } {
  const value = useContext(ReviewContext)
  if (!value) throw new Error('useReview is only usable inside an AIReviewProvider')
  return value
}

/** The suggestions for one section, if there are any. */
export function useSectionReview<T>(sectionId: string): SectionReview<T> | undefined {
  return useReview<T>().reviews.find((r) => r.sectionId === sectionId)
}
