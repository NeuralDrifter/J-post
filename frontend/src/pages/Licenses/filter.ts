/** One library and its license, as written by `go generate ./...` (internal/licensegen). */
export type LicenseEntry = { name: string; version: string; license: string; url: string; text: string }

/** Entries whose name or license ID contains the query, ignoring case. */
export function filterLicenses(entries: LicenseEntry[], query: string): LicenseEntry[] {
  const q = query.trim().toLowerCase()
  if (!q) return entries
  return entries.filter((e) => e.name.toLowerCase().includes(q) || e.license.toLowerCase().includes(q))
}
