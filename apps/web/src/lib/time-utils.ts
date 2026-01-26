/**
 * Time utility functions for formatting minutes-based time values.
 * ZMI Time stores all time values in minutes internally.
 */

/**
 * Format minutes to HH:MM string.
 * @example formatMinutes(510) => "8:30"
 * @example formatMinutes(0) => "0:00"
 * @example formatMinutes(-60) => "-1:00"
 */
export function formatMinutes(minutes: number): string {
  const isNegative = minutes < 0
  const absMinutes = Math.abs(minutes)
  const hours = Math.floor(absMinutes / 60)
  const mins = absMinutes % 60
  const sign = isNegative ? '-' : ''
  return `${sign}${hours}:${mins.toString().padStart(2, '0')}`
}

/**
 * Format minutes to human readable duration.
 * @example formatDuration(510) => "8h 30m"
 * @example formatDuration(60) => "1h"
 * @example formatDuration(30) => "30m"
 * @example formatDuration(0) => "0m"
 */
export function formatDuration(minutes: number): string {
  const isNegative = minutes < 0
  const absMinutes = Math.abs(minutes)
  const hours = Math.floor(absMinutes / 60)
  const mins = absMinutes % 60
  const sign = isNegative ? '-' : ''

  if (hours === 0) {
    return `${sign}${mins}m`
  }
  if (mins === 0) {
    return `${sign}${hours}h`
  }
  return `${sign}${hours}h ${mins}m`
}

/**
 * Format balance with +/- indicator.
 * @example formatBalance(30) => "+0:30"
 * @example formatBalance(-60) => "-1:00"
 * @example formatBalance(0) => "0:00"
 */
export function formatBalance(minutes: number): string {
  if (minutes === 0) {
    return '0:00'
  }
  const sign = minutes > 0 ? '+' : ''
  return `${sign}${formatMinutes(minutes)}`
}

/**
 * Format balance with +/- indicator in human readable duration format.
 * @example formatBalanceDuration(30) => "+30m"
 * @example formatBalanceDuration(-90) => "-1h 30m"
 * @example formatBalanceDuration(0) => "0m"
 */
export function formatBalanceDuration(minutes: number): string {
  if (minutes === 0) {
    return '0m'
  }
  const sign = minutes > 0 ? '+' : ''
  return `${sign}${formatDuration(minutes)}`
}

/**
 * Get start of current week (Monday).
 * @param date - The reference date (defaults to today)
 * @returns Date object for Monday of that week at midnight
 */
export function getWeekStart(date: Date = new Date()): Date {
  const d = new Date(date)
  const day = d.getDay()
  // getDay() returns 0 for Sunday, 1 for Monday, etc.
  // We want Monday to be the start of the week
  const diff = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diff)
  d.setHours(0, 0, 0, 0)
  return d
}

/**
 * Get end of current week (Sunday).
 * @param date - The reference date (defaults to today)
 * @returns Date object for Sunday of that week at 23:59:59
 */
export function getWeekEnd(date: Date = new Date()): Date {
  const start = getWeekStart(date)
  const end = new Date(start)
  end.setDate(end.getDate() + 6)
  end.setHours(23, 59, 59, 999)
  return end
}

/**
 * Format date as YYYY-MM-DD (ISO date format).
 * @example formatDate(new Date(2026, 0, 25)) => "2026-01-25"
 */
export function formatDate(date: Date): string {
  const year = date.getFullYear()
  const month = (date.getMonth() + 1).toString().padStart(2, '0')
  const day = date.getDate().toString().padStart(2, '0')
  return `${year}-${month}-${day}`
}

/**
 * Format time from minutes since midnight to HH:MM.
 * @example formatTime(510) => "08:30"
 * @example formatTime(1380) => "23:00"
 */
export function formatTime(minutesSinceMidnight: number): string {
  const hours = Math.floor(minutesSinceMidnight / 60)
  const mins = minutesSinceMidnight % 60
  return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`
}

/**
 * Parse ISO datetime string and format as time only (HH:MM).
 * @example formatTimeFromIso("2026-01-25T08:30:00Z") => "08:30"
 */
export function formatTimeFromIso(isoString: string): string {
  const date = new Date(isoString)
  return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`
}

/**
 * Get time-aware greeting based on current hour.
 * @returns "Good morning", "Good afternoon", or "Good evening"
 */
export function getGreeting(): string {
  const hour = new Date().getHours()
  if (hour < 12) {
    return 'Good morning'
  }
  if (hour < 18) {
    return 'Good afternoon'
  }
  return 'Good evening'
}

/**
 * Format a date relative to today.
 * @example formatRelativeDate(today) => "Today"
 * @example formatRelativeDate(yesterday) => "Yesterday"
 * @example formatRelativeDate(someDate) => "Jan 25, 2026"
 */
export function formatRelativeDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)

  if (formatDate(d) === formatDate(today)) {
    return 'Today'
  }
  if (formatDate(d) === formatDate(yesterday)) {
    return 'Yesterday'
  }
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

/**
 * Get today's date formatted as YYYY-MM-DD.
 */
export function getToday(): string {
  return formatDate(new Date())
}

/**
 * Get current time as HH:MM string.
 * @example getCurrentTimeString() => "14:30"
 */
export function getCurrentTimeString(): string {
  const now = new Date()
  return `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`
}

/**
 * Convert HH:MM string to minutes from midnight.
 * @example timeStringToMinutes("08:30") => 510
 */
export function timeStringToMinutes(time: string): number {
  const parts = time.split(':').map(Number)
  const hours = parts[0] ?? 0
  const minutes = parts[1] ?? 0
  return hours * 60 + minutes
}

/**
 * Format elapsed milliseconds as H:MM:SS.
 * @example formatElapsedTime(3661000) => "1:01:01"
 */
export function formatElapsedTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
}

/**
 * Parse ISO date string to Date object (date part only, ignoring time).
 * Handles both date-only format ("2026-01-25") and full ISO datetime ("2026-01-25T00:00:00Z").
 * @example parseISODate("2026-01-25") => Date(2026, 0, 25)
 * @example parseISODate("2026-01-25T00:00:00Z") => Date(2026, 0, 25)
 */
export function parseISODate(dateString: string): Date {
  // Extract just the date part (before any 'T')
  const datePart = dateString.split('T')[0] ?? dateString
  const parts = datePart.split('-').map(Number)
  const year = parts[0] ?? 1970
  const month = parts[1] ?? 1
  const day = parts[2] ?? 1
  return new Date(year, month - 1, day)
}

/**
 * Get start and end dates for a week containing the given date.
 * Week starts on Monday.
 */
export function getWeekRange(date: Date): { start: Date; end: Date } {
  const start = getWeekStart(date)
  const end = new Date(start)
  end.setDate(start.getDate() + 6)
  return { start, end }
}

/**
 * Get start and end dates for a month containing the given date.
 */
export function getMonthRange(date: Date): { start: Date; end: Date } {
  const start = new Date(date.getFullYear(), date.getMonth(), 1)
  const end = new Date(date.getFullYear(), date.getMonth() + 1, 0)
  return { start, end }
}

/**
 * Get array of dates for a week.
 */
export function getWeekDates(date: Date): Date[] {
  const { start } = getWeekRange(date)
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start)
    d.setDate(start.getDate() + i)
    return d
  })
}

/**
 * Get array of dates for a month.
 */
export function getMonthDates(date: Date): Date[] {
  const { start, end } = getMonthRange(date)
  const dates: Date[] = []
  const current = new Date(start)
  while (current <= end) {
    dates.push(new Date(current))
    current.setDate(current.getDate() + 1)
  }
  return dates
}

/**
 * Format date for display with different formats.
 */
export function formatDisplayDate(date: Date, format: 'short' | 'long' | 'weekday' = 'short'): string {
  switch (format) {
    case 'short':
      return date.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })
    case 'long':
      return date.toLocaleDateString('de-DE', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric'
      })
    case 'weekday':
      return date.toLocaleDateString('de-DE', { weekday: 'short' })
    default:
      return date.toLocaleDateString('de-DE')
  }
}

/**
 * Check if two dates are the same day.
 */
export function isSameDay(date1: Date, date2: Date): boolean {
  return (
    date1.getFullYear() === date2.getFullYear() &&
    date1.getMonth() === date2.getMonth() &&
    date1.getDate() === date2.getDate()
  )
}

/**
 * Check if a date is today.
 */
export function isToday(date: Date): boolean {
  return isSameDay(date, new Date())
}

/**
 * Check if a date is a weekend (Saturday or Sunday).
 */
export function isWeekend(date: Date): boolean {
  const day = date.getDay()
  return day === 0 || day === 6
}
