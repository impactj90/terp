/**
 * Date helpers for date-only (no time) values used by `<Input type="date">`
 * and `@db.Date` Prisma columns.
 *
 * All helpers treat the wire format as `YYYY-MM-DD` and assume the user is
 * expressing a civil-calendar date — not a timestamp. Constructing via
 * `new Date("YYYY-MM-DD")` would parse as UTC midnight, which shifts the
 * displayed day by one in timezones west of UTC. These helpers construct
 * the Date at local midnight so display and round-trip stay on the intended
 * calendar day.
 */

const displayFormatter = new Intl.DateTimeFormat("de-DE")

/**
 * Parse a `YYYY-MM-DD` string (as produced by `<Input type="date">`) into a
 * Date at local midnight. Returns null for empty/invalid input.
 */
export function parseInputDate(value: string | null | undefined): Date | null {
  if (!value) return null
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  if (!year || !month || !day) return null
  return new Date(year, month - 1, day)
}

/**
 * Format a Date (or ISO-like string) as `YYYY-MM-DD` for use as the `value`
 * of `<Input type="date">`. Uses the local calendar day of the input so the
 * string round-trips stably with `parseInputDate`.
 */
export function formatInputDate(value: Date | string | null | undefined): string {
  if (value == null) return ""
  const d = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(d.getTime())) return ""
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

/**
 * Format a Date (or ISO-like string) for German display: `TT.MM.JJJJ`.
 * Returns an empty string for null/undefined input.
 */
export function formatDisplayDate(value: Date | string | null | undefined): string {
  if (value == null) return ""
  const d = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(d.getTime())) return ""
  return displayFormatter.format(d)
}
