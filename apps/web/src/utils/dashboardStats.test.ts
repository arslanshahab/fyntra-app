import { describe, expect, it } from 'vitest'

import type { AttendanceRecord, School } from '@fyntra/schemas'
import { computeDashboardStats } from './dashboardStats'
import { schoolDateTime } from './datetime'

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

function rec(over: Partial<AttendanceRecord>): AttendanceRecord {
  return {
    id: 'att',
    studentId: 'std',
    date: '2026-05-11',
    status: 'present',
    isManual: false,
    ...over,
  }
}

describe('computeDashboardStats', () => {
  it('counts records with firstInAt under present/late by status', () => {
    const records = [
      rec({ status: 'present', firstInAt: 'x' }),
      rec({ status: 'present', firstInAt: 'x' }),
      rec({ status: 'late', firstInAt: 'x' }),
      rec({ status: 'left_early', firstInAt: 'x' }),
    ]
    const stats = computeDashboardStats(records, school, schoolDateTime('2026-05-11', '10:00'))
    expect(stats.present).toBe(3) // 2 present + 1 left_early
    expect(stats.late).toBe(1)
    expect(stats.absent).toBe(0)
    expect(stats.noTapYet).toBe(0)
  })

  it('classifies records without firstInAt as no-tap-yet before the absent threshold', () => {
    const records = [rec({ status: 'absent' }), rec({ status: 'absent' })]
    // 07:55 = 10 min after start, before the 30 min threshold
    const stats = computeDashboardStats(records, school, schoolDateTime('2026-05-11', '07:55'))
    expect(stats.noTapYet).toBe(2)
    expect(stats.absent).toBe(0)
  })

  it('classifies records without firstInAt as absent after the threshold', () => {
    const records = [rec({ status: 'absent' }), rec({ status: 'absent' })]
    const stats = computeDashboardStats(records, school, schoolDateTime('2026-05-11', '08:30'))
    expect(stats.absent).toBe(2)
    expect(stats.noTapYet).toBe(0)
  })

  it('returns total === records.length', () => {
    const records = [
      rec({ status: 'present', firstInAt: 'x' }),
      rec({ status: 'absent' }),
      rec({ status: 'late', firstInAt: 'x' }),
    ]
    const stats = computeDashboardStats(records, school, schoolDateTime('2026-05-11', '10:00'))
    expect(stats.total).toBe(3)
  })
})
