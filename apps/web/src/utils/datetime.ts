import { addMinutes, differenceInMinutes } from 'date-fns'
import { formatInTimeZone } from 'date-fns-tz'

import type { School } from '@fyntra/schemas'

export const KARACHI_TZ = 'Asia/Karachi'

// PKT is fixed at +05:00 (no DST), so wall-clock arithmetic via this offset
// is unambiguous. We rely on this for constructing school-day boundaries.
const PKT_OFFSET = '+05:00'

export function dateStrInKarachi(now: Date = new Date()): string {
  return formatInTimeZone(now, KARACHI_TZ, 'yyyy-MM-dd')
}

/** Construct a Date representing `dateStr` at `hhmm` in Asia/Karachi. */
export function schoolDateTime(dateStr: string, hhmm: string): Date {
  return new Date(`${dateStr}T${hhmm}:00.000${PKT_OFFSET}`)
}

export function schoolStart(school: School, now: Date = new Date()): Date {
  return schoolDateTime(dateStrInKarachi(now), school.startTime)
}

export function schoolEnd(school: School, now: Date = new Date()): Date {
  return schoolDateTime(dateStrInKarachi(now), school.endTime)
}

export function minutesUntilSchoolStart(now: Date, school: School): number {
  return differenceInMinutes(schoolStart(school, now), now)
}

export function minutesAfterSchoolStart(now: Date, school: School): number {
  return -minutesUntilSchoolStart(now, school)
}

/**
 * The polling window per README §6 — [start − 30, end + 30] in Asia/Karachi.
 * Polling is suppressed outside this window to save battery on parent phones
 * left open after pickup.
 */
export function isInSchoolPollingWindow(now: Date, school: School): boolean {
  const winStart = addMinutes(schoolStart(school, now), -30)
  const winEnd = addMinutes(schoolEnd(school, now), 30)
  return now >= winStart && now <= winEnd
}

/** Pretty-print an ISO timestamp as a wall-clock time in Asia/Karachi. */
export function formatTimeInKarachi(iso: string): string {
  return formatInTimeZone(new Date(iso), KARACHI_TZ, 'h:mm a')
}

/** Pretty-print a YYYY-MM-DD date for the timeline list ("Mon, May 11"). */
export function formatTimelineDate(ymdDate: string): string {
  // Anchor at midday so the date string parses unambiguously.
  return formatInTimeZone(
    new Date(`${ymdDate}T12:00:00.000${PKT_OFFSET}`),
    KARACHI_TZ,
    'EEE, MMM d',
  )
}

/**
 * Returns 'today' / 'yesterday' when `ymdDate` matches the current or previous
 * Karachi-tz day, or null otherwise. Callers render the prefix as a label and
 * compose with `formatTimelineDate` for the suffix.
 */
export function relativeDayPrefix(
  ymdDate: string,
  now: Date = new Date(),
): 'today' | 'yesterday' | null {
  const today = dateStrInKarachi(now)
  if (ymdDate === today) return 'today'
  const yesterday = dateStrInKarachi(new Date(now.getTime() - 86400000))
  if (ymdDate === yesterday) return 'yesterday'
  return null
}

/**
 * Split a millisecond duration into whole hours + remainder minutes. Negative
 * inputs clamp to zero so callers never need a guard. The parent ChildCard
 * uses this to render "3h 12m on campus" under the status hero.
 */
export function splitDuration(ms: number): { hours: number; minutes: number } {
  const totalMinutes = Math.max(0, Math.floor(ms / 60_000))
  return {
    hours: Math.floor(totalMinutes / 60),
    minutes: totalMinutes % 60,
  }
}
