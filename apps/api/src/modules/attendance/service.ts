import { dateAtKarachiTime } from '../../lib/time.js'
import { attendanceRepo } from './repository.js'

export async function recomputeAttendanceForDay(
  schoolId: string,
  studentId: string,
  ymd: string,
) {
  const school = await attendanceRepo.school(schoolId)
  if (!school) return null
  const taps = await attendanceRepo.tapsForDay(schoolId, studentId, ymd)
  if (taps.length === 0) return null

  const ins = taps.filter((t) => t.direction === 'in')
  const outs = taps.filter((t) => t.direction === 'out')
  const firstInAt = ins.length > 0 ? ins[0]!.occurredAt : null
  const lastOutAt = outs.length > 0 ? outs[outs.length - 1]!.occurredAt : null

  const startUtc = dateAtKarachiTime(ymd, school.startTime)
  const endUtc = dateAtKarachiTime(ymd, school.endTime)

  let status: 'present' | 'late' | 'left_early' = 'present'
  if (firstInAt) {
    const lateAtUtc = new Date(startUtc.getTime() + school.lateThresholdMinutes * 60 * 1000)
    if (firstInAt.getTime() > lateAtUtc.getTime()) status = 'late'
  }
  if (status !== 'late' && lastOutAt && lastOutAt.getTime() < endUtc.getTime()) {
    status = 'left_early'
  }

  const isManual = taps.some((t) => t.source === 'manual')

  return await attendanceRepo.upsertRecord({
    schoolId,
    studentId,
    date: ymd,
    firstInAt,
    lastOutAt,
    status,
    isManual,
  })
}
