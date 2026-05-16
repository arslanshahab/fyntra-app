import { describe, expect, it } from 'vitest'

import type { School } from '@fyntra/schemas'
import {
  dateStrInKarachi,
  formatTimeInKarachi,
  formatTimelineDate,
  isInSchoolPollingWindow,
  minutesAfterSchoolStart,
  minutesUntilSchoolStart,
  schoolDateTime,
} from './datetime'

const school: School = {
  id: 'sch_1',
  name: 'Test',
  address: 'Lahore',
  timezone: 'Asia/Karachi',
  startTime: '07:45',
  endTime: '13:30',
  lateThresholdMinutes: 15,
  absentThresholdMinutes: 30,
}

describe('dateStrInKarachi', () => {
  it('returns the date in Asia/Karachi (not UTC)', () => {
    // 2026-05-10 23:30 UTC = 2026-05-11 04:30 PKT, so date should be May 11.
    expect(dateStrInKarachi(new Date('2026-05-10T23:30:00.000Z'))).toBe('2026-05-11')
  })

  it('returns the prior day late evening UTC that is still the same day in PKT', () => {
    // 2026-05-11 18:00 UTC = 2026-05-11 23:00 PKT, still May 11.
    expect(dateStrInKarachi(new Date('2026-05-11T18:00:00.000Z'))).toBe('2026-05-11')
  })
})

describe('schoolDateTime', () => {
  it('anchors HH:mm to +05:00', () => {
    const d = schoolDateTime('2026-05-11', '07:45')
    expect(d.toISOString()).toBe('2026-05-11T02:45:00.000Z')
  })
})

describe('minutesUntilSchoolStart / minutesAfterSchoolStart', () => {
  it('returns positive minutes before start', () => {
    // 07:00 PKT, school starts 07:45 → 45 min before.
    const now = schoolDateTime('2026-05-11', '07:00')
    expect(minutesUntilSchoolStart(now, school)).toBe(45)
    expect(minutesAfterSchoolStart(now, school)).toBe(-45)
  })

  it('returns negative minutes after start', () => {
    // 08:30 PKT, school started 07:45 → 45 min after.
    const now = schoolDateTime('2026-05-11', '08:30')
    expect(minutesUntilSchoolStart(now, school)).toBe(-45)
    expect(minutesAfterSchoolStart(now, school)).toBe(45)
  })
})

describe('isInSchoolPollingWindow', () => {
  it('is true at the start of the window (start − 30 min)', () => {
    const now = schoolDateTime('2026-05-11', '07:15')
    expect(isInSchoolPollingWindow(now, school)).toBe(true)
  })

  it('is true at the end of the window (end + 30 min)', () => {
    const now = schoolDateTime('2026-05-11', '14:00')
    expect(isInSchoolPollingWindow(now, school)).toBe(true)
  })

  it('is false 31 minutes before start', () => {
    const now = schoolDateTime('2026-05-11', '07:14')
    expect(isInSchoolPollingWindow(now, school)).toBe(false)
  })

  it('is false 31 minutes after end', () => {
    const now = schoolDateTime('2026-05-11', '14:01')
    expect(isInSchoolPollingWindow(now, school)).toBe(false)
  })
})

describe('formatTimeInKarachi', () => {
  it('formats an ISO timestamp in PKT wall clock', () => {
    expect(formatTimeInKarachi('2026-05-11T02:42:00.000Z')).toBe('7:42 AM')
  })
})

describe('formatTimelineDate', () => {
  it('formats a YMD as a short weekday + month + day', () => {
    expect(formatTimelineDate('2026-05-11')).toMatch(/Mon, May 11/)
  })
})
