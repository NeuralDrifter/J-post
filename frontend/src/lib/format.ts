// Labels and pure formatting helpers shared by every page.

export const STATUSES = ['interested', 'applied', 'interviewing', 'offer', 'closed'] as const
export type Status = (typeof STATUSES)[number]

export const STATUS_LABEL: Record<string, string> = {
  interested: 'Interested',
  applied: 'Applied',
  interviewing: 'Interviewing',
  offer: 'Offer',
  closed: 'Closed',
}

export const STATUS_DOT: Record<string, string> = {
  interested: 'bg-ink-3',
  applied: 'bg-sky-400',
  interviewing: 'bg-info',
  offer: 'bg-success',
  closed: 'bg-ink-3/50',
}

export const CLOSE_REASONS = ['rejected', 'withdrawn', 'ghosted', 'declined'] as const

export const CLOSE_REASON_LABEL: Record<string, string> = {
  rejected: 'Not selected',
  withdrawn: 'I withdrew',
  ghosted: 'No response',
  declined: 'I declined',
}

export const WORK_MODE_LABEL: Record<string, string> = { remote: 'Remote', hybrid: 'Hybrid', onsite: 'On-site' }

export const SOURCE_LABEL: Record<string, string> = {
  linkedin: 'LinkedIn',
  indeed: 'Indeed',
  zip_recruiter: 'ZipRecruiter',
  adzuna: 'Adzuna',
  manual: 'Manual',
}

export const INTERVIEW_KINDS = ['phone_screen', 'technical', 'behavioral', 'onsite', 'panel', 'other'] as const

export const INTERVIEW_KIND_LABEL: Record<string, string> = {
  phone_screen: 'Phone screen',
  technical: 'Technical',
  behavioral: 'Behavioral',
  onsite: 'Onsite',
  panel: 'Panel',
  other: 'Interview',
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** 120000 → "$120k", 93600 → "$93.6k", 850 → "$850". */
export function formatMoney(n: number): string {
  if (n >= 1000) {
    const k = n / 1000
    return `$${Number.isInteger(k) ? k : k.toFixed(1)}k`
  }
  return `$${n}`
}

/** A compact salary range; zero or missing ends are treated as unknown. */
export function formatSalary(min?: number, max?: number): string {
  const lo = min && min > 0 ? min : undefined
  const hi = max && max > 0 ? max : undefined
  if (lo && hi) return lo === hi ? formatMoney(lo) : `${formatMoney(lo)} – ${formatMoney(hi)}`
  if (lo) return `${formatMoney(lo)}+`
  if (hi) return `Up to ${formatMoney(hi)}`
  return ''
}

export function initials(company: string): string {
  const words = company.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return '?'
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase()
  return (words[0][0] + words[1][0]).toUpperCase()
}

/** Parses "YYYY-MM-DD" as a local calendar date (not UTC), anything else via Date. */
export function parseDate(value: string): Date | undefined {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  const d = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(value)
  return Number.isNaN(d.getTime()) ? undefined : d
}

/** "Oct 1, 2026" */
export function formatDate(value: string): string {
  const d = value ? parseDate(value) : undefined
  return d ? `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}` : ''
}

/** "Oct 2, 3:00 PM" in local time. */
export function formatDateTime(value: string): string {
  const d = value ? parseDate(value) : undefined
  if (!d) return ''
  const h = d.getHours() % 12 || 12
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${h}:${mm} ${d.getHours() < 12 ? 'AM' : 'PM'}`
}

export function daysLabel(n: number): string {
  if (n <= 0) return 'Today'
  return n === 1 ? '1 day' : `${n} days`
}

/** 0.333 → "33%", undefined → "—". */
export function percent(rate?: number): string {
  return rate === undefined || rate === null ? '—' : `${Math.round(rate * 100)}%`
}

/** Accepts "120k", "$120,000", "95.5k"; returns undefined for blank or invalid input. */
export function parseSalaryInput(input: string): number | undefined {
  let s = input.trim().toLowerCase().replace(/[$,\s]/g, '')
  if (!s) return undefined
  let factor = 1
  if (s.endsWith('k')) {
    factor = 1000
    s = s.slice(0, -1)
  }
  if (!/^\d+(\.\d+)?$/.test(s)) return undefined
  const n = Math.round(Number(s) * factor)
  return n > 0 ? n : undefined
}

const pad = (n: number) => String(n).padStart(2, '0')

/** ISO timestamp → value for <input type="datetime-local"> in local time. */
export function toLocalInputValue(iso: string): string {
  const d = iso ? new Date(iso) : undefined
  if (!d || Number.isNaN(d.getTime())) return ''
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** <input type="datetime-local"> value → ISO timestamp (UTC), matching the Go tsLayout. */
export function fromLocalInputValue(value: string): string {
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? '' : d.toISOString()
}

export function todayLocal(): string {
  const d = new Date()
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** "just now", "45 min ago", "2h ago", "3 days ago". */
export function timeAgo(iso: string, now: Date = new Date()): string {
  const d = iso ? new Date(iso) : undefined
  if (!d || Number.isNaN(d.getTime())) return ''
  const minutes = Math.floor((now.getTime() - d.getTime()) / 60000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return days === 1 ? '1 day ago' : `${days} days ago`
}
