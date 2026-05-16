import type { AttendanceRecord, School } from '@fyntra/schemas'
import { minutesAfterSchoolStart } from './datetime'

export interface DashboardStats {
  present: number // includes left_early (they were here today)
  late: number
  absent: number
  noTapYet: number
  total: number
}

// Mirrors the live-status logic from deriveLiveStatus but at population scale.
// Without firstInAt, a record is "no tap yet" until the school's absent
// threshold elapses; afterwards it rolls into "absent". Records with
// firstInAt count under present/late by their stored status.
export function computeDashboardStats(
  records: AttendanceRecord[],
  school: School,
  now: Date,
): DashboardStats {
  const minsAfterStart = minutesAfterSchoolStart(now, school)
  const pastAbsentThreshold = minsAfterStart >= school.absentThresholdMinutes

  let present = 0
  let late = 0
  let absent = 0
  let noTapYet = 0

  for (const r of records) {
    if (r.firstInAt) {
      if (r.status === 'late') late += 1
      else present += 1
    } else if (pastAbsentThreshold) {
      absent += 1
    } else {
      noTapYet += 1
    }
  }

  return { present, late, absent, noTapYet, total: records.length }
}
