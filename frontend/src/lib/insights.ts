// Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
// SPDX-License-Identifier: MIT

// How the job search is going: how far applications get, how many hear back
// and how fast, whether tailored resumes do better, the weekly pace and where
// jobs come from. Follows Reactive Resume's application insights
// (apps/web/src/features/applications/insights.ts, MIT), on J-POST's stages.

export type InsightJob = { id: string; status: string; closeReason: string; source: string; resumeId: string; dateApplied: string; createdAt: string }
export type InsightEvent = { jobId: string; toStatus: string; closeReason: string; at: string }

/** The forward pipeline; closed is an outcome, not a step. */
const PIPELINE = ['interested', 'applied', 'interviewing', 'offer'] as const
const APPLIED = PIPELINE.indexOf('applied')
const REPLY_STAGES = new Set(['interviewing', 'offer'])
const DAY_MS = 86_400_000
const WEEK_MS = 7 * DAY_MS

const stageIndex = (status: string) => PIPELINE.indexOf(status as (typeof PIPELINE)[number])

type History = { job: InsightJob; events: InsightEvent[] }

/** Each job with its own stage changes, oldest first. */
function histories(jobs: readonly InsightJob[], events: readonly InsightEvent[]): History[] {
  const byJob = new Map<string, InsightEvent[]>()
  for (const event of [...events].sort((a, b) => a.at.localeCompare(b.at))) byJob.set(event.jobId, [...(byJob.get(event.jobId) ?? []), event])
  return jobs.map((job) => ({ job, events: byJob.get(job.id) ?? [] }))
}

/** How far a job ever got; a closed job keeps the furthest stage it reached. */
function furthestStage({ job, events }: History): number {
  return Math.max(stageIndex(job.status), ...events.map((e) => stageIndex(e.toStatus)))
}

/** When the application went out: its first move to Applied or beyond, else the applied date on record. */
function sentAt({ job, events }: History): number {
  const sent = events.find((e) => stageIndex(e.toStatus) >= APPLIED)
  return Date.parse(sent?.at ?? (job.dateApplied || job.createdAt))
}

/** The first reply after sending: an interview or offer, or a rejection. */
function firstReply(history: History): number | undefined {
  const since = sentAt(history)
  const reply = history.events.find((e) => Date.parse(e.at) >= since && (REPLY_STAGES.has(e.toStatus) || (e.toStatus === 'closed' && e.closeReason === 'rejected')))
  return reply ? Date.parse(reply.at) : undefined
}

export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2
}

export type ReplyCounts = { sent: number; replied: number }

export type Outcomes = {
  /** Applications that ever reached each stage from Applied on, closed ones included. */
  funnel: { status: 'applied' | 'interviewing' | 'offer'; reached: number }[]
  sent: number
  heardBack: number
  medianDaysToReply: number | null
  /** Applications sent with a resume made for that job, against those sent with another resume. */
  tailored: ReplyCounts
  base: ReplyCounts
  active: number
  closed: number
}

/** How applications turned out. `isTailored` says whether a job's resume was made for it. */
export function computeOutcomes(jobs: readonly InsightJob[], events: readonly InsightEvent[], isTailored: (job: InsightJob) => boolean): Outcomes {
  const sent = histories(jobs, events).filter((h) => furthestStage(h) >= APPLIED)
  const replies = sent.map((history) => ({ history, reply: firstReply(history) }))
  const withReplies = replies.filter((r) => r.reply !== undefined)
  const compare = (tailored: boolean): ReplyCounts => {
    const group = replies.filter(({ history }) => history.job.resumeId && isTailored(history.job) === tailored)
    return { sent: group.length, replied: group.filter((r) => r.reply !== undefined).length }
  }
  return {
    funnel: (['applied', 'interviewing', 'offer'] as const).map((status) => ({ status, reached: sent.filter((h) => furthestStage(h) >= stageIndex(status)).length })),
    sent: sent.length,
    heardBack: withReplies.length,
    medianDaysToReply: median(withReplies.map(({ history, reply }) => Math.round((reply! - sentAt(history)) / DAY_MS))),
    tailored: compare(true),
    base: compare(false),
    active: jobs.filter((j) => j.status !== 'closed' && j.status !== 'interested').length,
    closed: jobs.filter((j) => j.status === 'closed').length,
  }
}

export type WeekCount = { start: Date; count: number }

/** Applications sent per week (Monday to Sunday) over the last `weeks` weeks, oldest first. */
export function weeklyApplications(jobs: readonly InsightJob[], events: readonly InsightEvent[], now: Date, weeks = 8): WeekCount[] {
  const thisWeek = mondayOf(now)
  const buckets = Array.from({ length: weeks }, (_, i) => ({ start: new Date(thisWeek.getTime() - (weeks - 1 - i) * WEEK_MS), count: 0 }))
  const first = buckets[0]!.start.getTime()
  for (const history of histories(jobs, events)) {
    if (furthestStage(history) < APPLIED) continue
    const at = sentAt(history)
    if (at < first || Number.isNaN(at)) continue
    const bucket = buckets[Math.min(weeks - 1, Math.floor((at - first) / WEEK_MS))]
    if (bucket) bucket.count++
  }
  return buckets
}

function mondayOf(date: Date): Date {
  const day = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  day.setDate(day.getDate() - ((day.getDay() + 6) % 7))
  return day
}

/** How many jobs came from each source, most first. */
export function sourceCounts(jobs: readonly InsightJob[]): { source: string; count: number }[] {
  const counts = new Map<string, number>()
  for (const job of jobs) counts.set(job.source || 'manual', (counts.get(job.source || 'manual') ?? 0) + 1)
  return [...counts].map(([source, count]) => ({ source, count })).sort((a, b) => b.count - a.count || a.source.localeCompare(b.source))
}
