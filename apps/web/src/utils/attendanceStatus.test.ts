import { describe, expect, it } from 'vitest'

import type { AttendanceRecord, Device, School, Student } from '@fyntra/schemas'
import { schoolDateTime } from './datetime'
import { deriveLiveStatus, toneFor } from './attendanceStatus'

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

const onlineDevice: Device = {
  id: 'dev_main',
  schoolId: 'sch_1',
  label: 'Main Gate',
  direction: 'both',
  status: 'online',
  lastHeartbeat: '2026-05-11T02:00:00.000Z',
}

const offlineDevice: Device = { ...onlineDevice, status: 'offline' }

const studentWithCard: Pick<Student, 'cardId'> = { cardId: 'crd_1' }
const studentNoCard: Pick<Student, 'cardId'> = {}

function rec(over: Partial<AttendanceRecord> = {}): AttendanceRecord {
  return {
    id: 'att_1',
    studentId: 'std_1',
    date: '2026-05-11',
    status: 'present',
    isManual: false,
    ...over,
  }
}

describe('deriveLiveStatus', () => {
  it('returns no_card when the student has no card assigned', () => {
    const result = deriveLiveStatus({
      student: studentNoCard,
      attendance: null,
      school,
      devices: [onlineDevice],
      now: schoolDateTime('2026-05-11', '08:00'),
    })
    expect(result.kind).toBe('no_card')
  })

  it('returns unverified when no tap-in yet and all gates are offline', () => {
    const result = deriveLiveStatus({
      student: studentWithCard,
      attendance: null,
      school,
      devices: [offlineDevice],
      now: schoolDateTime('2026-05-11', '08:30'),
    })
    expect(result.kind).toBe('unverified')
  })

  it('returns pre_school before start', () => {
    const result = deriveLiveStatus({
      student: studentWithCard,
      attendance: null,
      school,
      devices: [onlineDevice],
      now: schoolDateTime('2026-05-11', '07:15'),
    })
    expect(result.kind).toBe('pre_school')
    if (result.kind === 'pre_school') expect(result.minutesUntilStart).toBe(30)
  })

  it('returns not_yet between start and the absent threshold', () => {
    const result = deriveLiveStatus({
      student: studentWithCard,
      attendance: null,
      school,
      devices: [onlineDevice],
      // 07:45 + 10 min = 07:55 — past start, before 30-min absent threshold
      now: schoolDateTime('2026-05-11', '07:55'),
    })
    expect(result.kind).toBe('not_yet')
  })

  it('returns absent after the absent threshold elapses with no tap', () => {
    const result = deriveLiveStatus({
      student: studentWithCard,
      attendance: null,
      school,
      devices: [onlineDevice],
      now: schoolDateTime('2026-05-11', '08:30'),
    })
    expect(result.kind).toBe('absent')
  })

  it('returns at_school when the student has tapped in but not out', () => {
    const result = deriveLiveStatus({
      student: studentWithCard,
      attendance: rec({ firstInAt: '2026-05-11T02:42:00.000Z' }),
      school,
      devices: [onlineDevice],
      now: schoolDateTime('2026-05-11', '10:00'),
    })
    expect(result.kind).toBe('at_school')
    if (result.kind === 'at_school') {
      expect(result.firstInAt).toBe('2026-05-11T02:42:00.000Z')
      expect(result.isLate).toBe(false)
    }
  })

  it('marks at_school as late when the record status is late', () => {
    const result = deriveLiveStatus({
      student: studentWithCard,
      attendance: rec({ firstInAt: '2026-05-11T03:10:00.000Z', status: 'late' }),
      school,
      devices: [onlineDevice],
      now: schoolDateTime('2026-05-11', '10:00'),
    })
    expect(result.kind).toBe('at_school')
    if (result.kind === 'at_school') expect(result.isLate).toBe(true)
  })

  it('returns left when both tap-in and tap-out exist', () => {
    const result = deriveLiveStatus({
      student: studentWithCard,
      attendance: rec({
        firstInAt: '2026-05-11T02:42:00.000Z',
        lastOutAt: '2026-05-11T08:35:00.000Z',
      }),
      school,
      devices: [onlineDevice],
      now: schoolDateTime('2026-05-11', '14:00'),
    })
    expect(result.kind).toBe('left')
  })

  it('returns left_early when status === left_early', () => {
    const result = deriveLiveStatus({
      student: studentWithCard,
      attendance: rec({
        status: 'left_early',
        firstInAt: '2026-05-11T02:42:00.000Z',
        lastOutAt: '2026-05-11T06:30:00.000Z',
      }),
      school,
      devices: [onlineDevice],
      now: schoolDateTime('2026-05-11', '14:00'),
    })
    expect(result.kind).toBe('left_early')
  })

  it("treats yesterday's record as not-yet-today", () => {
    const result = deriveLiveStatus({
      student: studentWithCard,
      attendance: rec({ date: '2026-05-10', firstInAt: '2026-05-10T02:42:00.000Z' }),
      school,
      devices: [onlineDevice],
      now: schoolDateTime('2026-05-11', '07:55'),
    })
    expect(result.kind).toBe('not_yet')
  })
})

describe('toneFor', () => {
  it('maps each live status to its semantic tone', () => {
    expect(toneFor({ kind: 'at_school', firstInAt: '', isLate: false })).toBe('present')
    expect(toneFor({ kind: 'at_school', firstInAt: '', isLate: true })).toBe('late')
    expect(toneFor({ kind: 'left', firstInAt: '', lastOutAt: '' })).toBe('present')
    expect(toneFor({ kind: 'left_early', firstInAt: '', lastOutAt: '' })).toBe('late')
    expect(toneFor({ kind: 'no_card' })).toBe('notyet')
    expect(toneFor({ kind: 'pre_school', minutesUntilStart: 30 })).toBe('notyet')
    expect(toneFor({ kind: 'not_yet', minutesAfterStart: 5 })).toBe('notyet')
    expect(toneFor({ kind: 'unverified' })).toBe('unverified')
    expect(toneFor({ kind: 'absent', minutesAfterStart: 45 })).toBe('absent')
  })
})
