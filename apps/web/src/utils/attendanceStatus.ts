import type { AttendanceRecord, Device, School, Student } from '@fyntra/schemas'
import { dateStrInKarachi, minutesAfterSchoolStart, minutesUntilSchoolStart } from './datetime'

// LiveStatus is the single source of truth for what to render in the parent
// hero. Derived from today's AttendanceRecord (which may not exist yet) +
// school config + device status — see README §9 for the edge cases this
// must honour:
//
//   - card not assigned          → no_card, never absent
//   - device offline + no tap    → unverified, never absent
//   - no tap by absent threshold → absent (alarm)
//   - has tap-in, no tap-out     → at_school
//   - has tap-in + tap-out       → left (or left_early)
export type LiveStatus =
  | { kind: 'no_card' }
  | { kind: 'unverified' }
  | { kind: 'pre_school'; minutesUntilStart: number }
  | { kind: 'not_yet'; minutesAfterStart: number }
  | { kind: 'at_school'; firstInAt: string; isLate: boolean }
  | { kind: 'left'; firstInAt: string; lastOutAt: string }
  | { kind: 'left_early'; firstInAt: string; lastOutAt: string }
  | { kind: 'absent'; minutesAfterStart: number }

export type LiveStatusTone = 'present' | 'late' | 'notyet' | 'unverified' | 'absent'

export function toneFor(status: LiveStatus): LiveStatusTone {
  switch (status.kind) {
    case 'at_school':
      return status.isLate ? 'late' : 'present'
    case 'left':
      return 'present'
    case 'left_early':
      return 'late'
    case 'no_card':
    case 'pre_school':
    case 'not_yet':
      return 'notyet'
    case 'unverified':
      return 'unverified'
    case 'absent':
      return 'absent'
  }
}

interface DeriveLiveStatusArgs {
  student: Pick<Student, 'cardId'>
  attendance: AttendanceRecord | null | undefined
  school: School
  devices: Device[]
  now: Date
}

export function deriveLiveStatus({
  student,
  attendance,
  school,
  devices,
  now,
}: DeriveLiveStatusArgs): LiveStatus {
  if (!student.cardId) return { kind: 'no_card' }

  const today = dateStrInKarachi(now)
  const todayRecord = attendance && attendance.date === today ? attendance : null

  const gateOnline = devices.some(
    (d) =>
      d.status === 'online' &&
      (d.direction === 'in' || d.direction === 'both' || d.direction === 'out'),
  )

  // Case 1: we have today's attendance with at least a tap-in.
  if (todayRecord?.firstInAt) {
    const isLate = todayRecord.status === 'late'
    if (todayRecord.lastOutAt) {
      if (todayRecord.status === 'left_early') {
        return {
          kind: 'left_early',
          firstInAt: todayRecord.firstInAt,
          lastOutAt: todayRecord.lastOutAt,
        }
      }
      return {
        kind: 'left',
        firstInAt: todayRecord.firstInAt,
        lastOutAt: todayRecord.lastOutAt,
      }
    }
    return { kind: 'at_school', firstInAt: todayRecord.firstInAt, isLate }
  }

  // No tap-in yet today. The order of checks below honours README §9:
  // device-offline beats absent (don't infer absence when we can't see).
  if (!gateOnline) return { kind: 'unverified' }

  const minutesUntil = minutesUntilSchoolStart(now, school)
  if (minutesUntil > 0) return { kind: 'pre_school', minutesUntilStart: minutesUntil }

  const minutesAfter = minutesAfterSchoolStart(now, school)
  if (minutesAfter >= school.absentThresholdMinutes) {
    return { kind: 'absent', minutesAfterStart: minutesAfter }
  }
  return { kind: 'not_yet', minutesAfterStart: minutesAfter }
}
