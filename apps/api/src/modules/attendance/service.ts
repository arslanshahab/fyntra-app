import { dateAtKarachiTime } from '../../lib/time.js'
import { attendanceRepo } from './repository.js'

export async function recomputeAttendanceForDay(
  schoolId: string,
  studentId: string,
  ymd: string,
) {
  const school = await attendanceRepo.school(schoolId)
  if (!school) return null

  // If the day is locked (register signed off), the recorded attendance is
  // authoritative — don't let late-arriving taps stomp the locked status.
  // Admin overrides bypass this via the manual-override path (which writes
  // the tap event but the recompute call from that flow still short-
  // circuits here for non-locked students).
  const existing = await attendanceRepo.findRecord(schoolId, studentId, ymd)
  if (existing?.lockedAt) return existing

  const taps = await attendanceRepo.tapsForDay(schoolId, studentId, ymd)
  if (taps.length === 0) return null

  const ins = taps.filter((t) => t.direction === 'in')
  const outs = taps.filter((t) => t.direction === 'out')
  const firstInAt = ins.length > 0 ? ins[0]!.occurredAt : null
  const lastOutAt = outs.length > 0 ? outs[outs.length - 1]!.occurredAt : null

  const startUtc = dateAtKarachiTime(ymd, school.startTime)
  const endUtc = dateAtKarachiTime(ymd, school.endTime)

  let status: 'present' | 'late' | 'left_early' | 'half_day' = 'present'
  if (firstInAt) {
    const lateAtUtc = new Date(startUtc.getTime() + school.lateThresholdMinutes * 60 * 1000)
    if (firstInAt.getTime() > lateAtUtc.getTime()) status = 'late'
  }
  if (status !== 'late' && lastOutAt && lastOutAt.getTime() < endUtc.getTime()) {
    status = 'left_early'
    // Half-day downgrade — if the school has a half-day cutoff and the
    // tap-out lands strictly before it, this is a half-day, not left_early.
    // Order matters: late always wins (kid was late AND left half-way is
    // still "late"), per spec §8.1 Q2.
    if (school.halfDayCutoffTime && lastOutAt) {
      const cutoffUtc = dateAtKarachiTime(ymd, school.halfDayCutoffTime)
      if (lastOutAt.getTime() < cutoffUtc.getTime()) {
        status = 'half_day'
      }
    }
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
