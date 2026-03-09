/**
 * Holiday Calendar Library
 *
 * Generates German state holidays for a given year and federal state.
 * Ported from apps/api/internal/holiday/calendar.go.
 *
 * @see apps/api/internal/holiday/calendar.go
 */

// --- German Federal State Codes ---

export type GermanState =
  | "BW"
  | "BY"
  | "BE"
  | "BB"
  | "HB"
  | "HH"
  | "HE"
  | "MV"
  | "NI"
  | "NW"
  | "RP"
  | "SL"
  | "SN"
  | "ST"
  | "SH"
  | "TH"

export const GERMAN_STATES: GermanState[] = [
  "BW",
  "BY",
  "BE",
  "BB",
  "HB",
  "HH",
  "HE",
  "MV",
  "NI",
  "NW",
  "RP",
  "SL",
  "SN",
  "ST",
  "SH",
  "TH",
]

const VALID_STATES = new Set<string>(GERMAN_STATES)

// --- Types ---

export interface HolidayDefinition {
  /** Date at UTC midnight */
  date: Date
  /** Holiday name (German) */
  name: string
}

// --- Public API ---

/**
 * Validate and parse a state code (case-insensitive).
 * Throws if invalid.
 */
export function parseState(code: string): GermanState {
  const normalized = code.trim().toUpperCase()
  if (!VALID_STATES.has(normalized)) {
    throw new Error(`Unknown state: ${code}`)
  }
  return normalized as GermanState
}

/**
 * Generate holidays for a given year and state.
 * Returns holidays sorted by date ascending.
 */
export function generateHolidays(
  year: number,
  state: GermanState
): HolidayDefinition[] {
  if (year < 1900 || year > 2200) {
    throw new Error(`Invalid year: ${year}`)
  }
  if (!VALID_STATES.has(state)) {
    throw new Error(`Unknown state: ${state}`)
  }

  const easter = easterSunday(year)

  function fixed(month: number, day: number, name: string): HolidayDefinition {
    return {
      date: new Date(Date.UTC(year, month - 1, day)),
      name,
    }
  }

  function offset(days: number, name: string): HolidayDefinition {
    const d = new Date(easter.getTime())
    d.setUTCDate(d.getUTCDate() + days)
    return { date: d, name }
  }

  // 9 Nationwide holidays
  const holidays: HolidayDefinition[] = [
    fixed(1, 1, "Neujahr"),
    offset(-2, "Karfreitag"),
    offset(1, "Ostermontag"),
    fixed(5, 1, "Tag der Arbeit"),
    offset(39, "Christi Himmelfahrt"),
    offset(50, "Pfingstmontag"),
    fixed(10, 3, "Tag der Deutschen Einheit"),
    fixed(12, 25, "1. Weihnachtstag"),
    fixed(12, 26, "2. Weihnachtstag"),
  ]

  // State-specific holidays
  if (state === "BW" || state === "BY" || state === "ST") {
    holidays.push(fixed(1, 6, "Heilige Drei Koenige"))
  }

  if (state === "BE" || state === "MV") {
    holidays.push(fixed(3, 8, "Internationaler Frauentag"))
  }

  if (state === "BB") {
    holidays.push(offset(0, "Ostersonntag"))
    holidays.push(offset(49, "Pfingstsonntag"))
  }

  if (
    state === "BW" ||
    state === "BY" ||
    state === "HE" ||
    state === "NW" ||
    state === "RP" ||
    state === "SL"
  ) {
    holidays.push(offset(60, "Fronleichnam"))
  }

  if (state === "BY" || state === "SL") {
    holidays.push(fixed(8, 15, "Mariae Himmelfahrt"))
  }

  if (
    state === "BW" ||
    state === "BY" ||
    state === "NW" ||
    state === "RP" ||
    state === "SL"
  ) {
    holidays.push(fixed(11, 1, "Allerheiligen"))
  }

  if (
    state === "BB" ||
    state === "MV" ||
    state === "SN" ||
    state === "ST" ||
    state === "TH" ||
    state === "HB" ||
    state === "HH" ||
    state === "NI" ||
    state === "SH"
  ) {
    holidays.push(fixed(10, 31, "Reformationstag"))
  }

  if (state === "SN") {
    holidays.push(repentanceDay(year))
  }

  if (state === "TH") {
    holidays.push(fixed(9, 20, "Weltkindertag"))
  }

  // Sort by date ascending
  holidays.sort((a, b) => a.date.getTime() - b.date.getTime())

  return holidays
}

// --- Easter Algorithm ---

/**
 * Compute Easter Sunday for a given year using the anonymous Gregorian algorithm
 * (Gauss/Meeus).
 * Ported from Go: apps/api/internal/holiday/calendar.go lines 140-156.
 */
export function easterSunday(year: number): Date {
  const a = year % 19
  const b = Math.floor(year / 100)
  const c = year % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31)
  const day = ((h + l - 7 * m + 114) % 31) + 1
  return new Date(Date.UTC(year, month - 1, day))
}

// --- Repentance Day ---

/**
 * Compute Buss- und Bettag (Repentance and Prayer Day).
 * The Wednesday before November 23.
 * Ported from Go: apps/api/internal/holiday/calendar.go lines 158-166.
 */
function repentanceDay(year: number): HolidayDefinition {
  // Start at Nov 22 (one day before Nov 23) and step back to find Wednesday
  const date = new Date(Date.UTC(year, 10, 22)) // Nov 22
  while (date.getUTCDay() !== 3) {
    // 3 = Wednesday
    date.setUTCDate(date.getUTCDate() - 1)
  }
  return { date, name: "Buss- und Bettag" }
}
