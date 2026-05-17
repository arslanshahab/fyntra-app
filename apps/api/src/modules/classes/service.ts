import type { AttendanceRecord } from '@fyntra/schemas'
import { ForbiddenError, NotFoundError } from '../../lib/errors.js'
import type { TenantContext } from '../../types/tenant-context.js'
import type { attendanceRecords } from '../../db/schema/attendance.js'
import { classesRepo } from './repository.js'

type AttendanceRow = typeof attendanceRecords.$inferSelect

export async function listClasses(ctx: TenantContext) {
  return await classesRepo.list(ctx)
}

export async function classAttendanceForDay(
  ctx: TenantContext,
  classId: string,
  ymd: string,
) {
  const cls = await classesRepo.findById(ctx, classId)
  if (!cls) throw new NotFoundError('Class not found')
  const rows = await classesRepo.attendanceForDay(ctx, classId, ymd)
  return { classId, date: ymd, rows }
}

// Wire-shape an attendance row (with lock metadata), reused by the register
// lock endpoint. Mirrors the toWire helper in reports/service.ts but always
// surfaces lockedAt/lockedBy when set.
function attendanceToWire(r: AttendanceRow): AttendanceRecord {
  return {
    id: r.id,
    studentId: r.studentId,
    date: r.date,
    firstInAt: r.firstInAt?.toISOString() ?? undefined,
    lastOutAt: r.lastOutAt?.toISOString() ?? undefined,
    status: r.status,
    isManual: r.isManual,
    cardAnomaly: r.cardAnomaly || undefined,
    leftWithoutScan: r.leftWithoutScan || undefined,
    flaggedForReview: r.flaggedForReview || undefined,
    lockedAt: r.lockedAt?.toISOString() ?? undefined,
    lockedBy: r.lockedBy ?? undefined,
  }
}

export interface LockRegisterResult {
  classId: string
  date: string
  lockedAt: string
  lockedBy: string
  records: AttendanceRecord[]
}

// Allowed when caller is admin OR the assigned teacher of the class.
async function authorizeRegisterWrite(
  ctx: TenantContext,
  classId: string,
  options: { adminOnly: boolean },
) {
  const cls = await classesRepo.findById(ctx, classId)
  if (!cls) throw new NotFoundError('Class not found')
  if (ctx.role === 'admin') return cls
  if (options.adminOnly) throw new ForbiddenError()
  if (ctx.role !== 'teacher' || cls.teacherId !== ctx.userId) {
    throw new ForbiddenError()
  }
  return cls
}

export async function lockRegisterForClass(
  ctx: TenantContext,
  classId: string,
  ymd: string,
): Promise<LockRegisterResult> {
  await authorizeRegisterWrite(ctx, classId, { adminOnly: false })

  // 1) Compute the set of class students missing a record for this day.
  const studentIds = await classesRepo.activeStudentIds(ctx, classId)
  const existing = await classesRepo.recordsForStudentsOnDate(ctx, studentIds, ymd)
  const haveRecord = new Set(existing.map((r) => r.studentId))
  const missing = studentIds.filter((id) => !haveRecord.has(id))

  // 2) Backfill `absent` rows for the missing students (functionally an
  //    on-demand absent job scoped to this class). isManual: true marks them
  //    as register-lock-driven rather than tap-driven.
  if (missing.length > 0) {
    await classesRepo.insertAbsentRows(ctx, missing, ymd)
  }

  // 3) Lock every (class-student, date) record that isn't already locked.
  //    Idempotent: re-locking by the same or different caller leaves the
  //    original lockedAt/lockedBy intact (locks an empty set).
  const lockedAt = new Date()
  await classesRepo.lockRecords(ctx, studentIds, ymd, ctx.userId, lockedAt)

  // 4) Return the post-lock state. Re-read so the caller gets every record
  //    (including the freshly backfilled absent rows).
  const after = await classesRepo.recordsForStudentsOnDate(ctx, studentIds, ymd)
  if (after.length === 0) {
    // Class has no active students. Synthesize an empty lock response —
    // teacher hit the button on an empty class roster, which is fine.
    return {
      classId,
      date: ymd,
      lockedAt: lockedAt.toISOString(),
      lockedBy: ctx.userId,
      records: [],
    }
  }
  // The lock might be older than lockedAt (idempotent re-lock); use the
  // earliest lockedAt across the rows as the authoritative day-lock time.
  const earliestLockedAt = after.reduce<Date>(
    (acc, r) => (r.lockedAt && r.lockedAt < acc ? r.lockedAt : acc),
    lockedAt,
  )
  const firstLockedBy = after.find((r) => r.lockedBy)?.lockedBy ?? ctx.userId
  return {
    classId,
    date: ymd,
    lockedAt: earliestLockedAt.toISOString(),
    lockedBy: firstLockedBy,
    records: after.map(attendanceToWire),
  }
}

export async function unlockRegisterForClass(
  ctx: TenantContext,
  classId: string,
  ymd: string,
) {
  await authorizeRegisterWrite(ctx, classId, { adminOnly: true })
  const studentIds = await classesRepo.activeStudentIds(ctx, classId)
  await classesRepo.unlockRecords(ctx, studentIds, ymd)
  return { ok: true as const }
}

// Used by tap-events/manual to gate non-admin overrides on a locked day.
export async function isStudentDayLocked(
  ctx: TenantContext,
  studentId: string,
  ymd: string,
): Promise<boolean> {
  const rows = await classesRepo.recordsForStudentsOnDate(ctx, [studentId], ymd)
  return rows.some((r) => r.lockedAt !== null)
}
