import type {
  AttendanceRecord,
  Class,
  ClassRegisterResponse,
  HolidayKind,
  RegisterDay,
  Student,
  StudentSummary,
  Weekday,
} from '@fyntra/schemas'
import { ForbiddenError, NotFoundError } from '../../lib/errors.js'
import type { TenantContext } from '../../types/tenant-context.js'
import type { attendanceRecords } from '../../db/schema/attendance.js'
import { schoolsRepo } from '../schools/repository.js'
import { classesRepo } from './repository.js'

type AttendanceRow = typeof attendanceRecords.$inferSelect

export async function listClasses(ctx: TenantContext): Promise<Class[]> {
  const rows = await classesRepo.list(ctx)
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    teacherId: r.teacherId,
    schoolId: r.schoolId,
    studentCount: r.studentCount,
  }))
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

// --- Monthly register (F5) ----------------------------------------------

// Maps JS Date.getUTCDay() (0=Sun..6=Sat) to our 3-letter Weekday enum.
const WEEKDAY_BY_JS_DAY: Weekday[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

// "YYYY-MM" → [firstYmd, lastYmd] inclusive, treating the month as a
// Karachi calendar month (no DST, so just calendar math).
function monthRange(month: string): { from: string; to: string; days: string[] } {
  const [y, m] = month.split('-').map(Number) as [number, number]
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate() // m is 1-based; day 0 of next month is last of m
  const days: string[] = []
  for (let d = 1; d <= last; d++) days.push(`${y}-${pad2(m)}-${pad2(d)}`)
  return { from: days[0]!, to: days[days.length - 1]!, days }
}

function weekdayOf(ymd: string): Weekday {
  const [y, m, d] = ymd.split('-').map(Number) as [number, number, number]
  const js = new Date(Date.UTC(y, m - 1, d)).getUTCDay()
  return WEEKDAY_BY_JS_DAY[js]!
}

function toRegisterDay(
  ymd: string,
  workingDayCodes: Set<Weekday>,
  holidayByDate: Map<string, { label: string; kind: HolidayKind }>,
): RegisterDay {
  const wd = weekdayOf(ymd)
  const holiday = holidayByDate.get(ymd)
  // A weekend is never a working day. A configured working day is a working
  // day unless the date is a `closed` or `exam` holiday. `half_day` holidays
  // are still working days — kids still have to show up for the short day.
  const baseWorking = workingDayCodes.has(wd)
  const isWorkingDay = baseWorking && !(holiday?.kind === 'closed' || holiday?.kind === 'exam')
  return {
    date: ymd,
    weekday: wd,
    isWorkingDay,
    ...(holiday ? { holiday: { label: holiday.label, kind: holiday.kind } } : {}),
  }
}

// Wire-shape a Student row for the register response. Strips DB-only fields.
function studentToWire(s: { id: string; fullName: string; rollNumber: string; classId: string; schoolId: string; status: 'active' | 'inactive'; photoUrl: string | null }): Student {
  return {
    id: s.id,
    fullName: s.fullName,
    rollNumber: s.rollNumber,
    classId: s.classId,
    schoolId: s.schoolId,
    guardianIds: [],
    photoUrl: s.photoUrl ?? undefined,
    status: s.status,
  }
}

export async function registerForMonth(
  ctx: TenantContext,
  classId: string,
  month: string,
): Promise<ClassRegisterResponse> {
  // 404 → 403 ordering: cross-tenant class returns 404 first, then we check
  // the role gate. Mirrors lock/unlock.
  const cls = await classesRepo.findById(ctx, classId)
  if (!cls) throw new NotFoundError('Class not found')
  if (ctx.role === 'parent') throw new ForbiddenError()
  if (ctx.role === 'teacher' && cls.teacherId !== ctx.userId) {
    throw new ForbiddenError()
  }

  const school = await schoolsRepo.findById(ctx.schoolId)
  if (!school) throw new NotFoundError('School not found')

  const { from, to, days: dayYmds } = monthRange(month)

  const studentRows = await classesRepo.activeStudentRows(ctx, classId)
  const studentIds = studentRows.map((s) => s.id)
  const holidays = await classesRepo.holidaysForRange(ctx, from, to)
  const records = await classesRepo.recordsForStudentsInRange(ctx, studentIds, from, to)
  const excusedKeys = await classesRepo.excusedKeysInRange(ctx, studentIds, from, to)

  const workingDayCodes = new Set<Weekday>(school.workingDays as Weekday[])
  const holidayByDate = new Map<string, { label: string; kind: HolidayKind }>(
    holidays.map((h) => [h.date, { label: h.label, kind: h.kind }]),
  )

  const days: RegisterDay[] = dayYmds.map((d) => toRegisterDay(d, workingDayCodes, holidayByDate))
  const workingDaysInMonth = days.filter((d) => d.isWorkingDay).length

  // Per-student counts. Iterating records once is fine for a single class.
  const summaries: StudentSummary[] = studentRows.map((s) => {
    let present = 0
    let absent = 0
    let late = 0
    let halfDay = 0
    let excused = 0
    for (const r of records) {
      if (r.studentId !== s.id) continue
      const key = `${s.id}|${r.date}`
      switch (r.status) {
        case 'present':
          present++
          break
        case 'late':
          late++
          break
        case 'half_day':
          halfDay++
          break
        case 'left_early':
          // Per §8.1: left_early on a non-half-day-cutoff date stays present
          // for the % math (kid was there for most of the day). Count it
          // as present here.
          present++
          break
        case 'absent':
          if (excusedKeys.has(key)) excused++
          else absent++
          break
        case 'unverified':
          // Doesn't count as anything in the summary; the cell renderer
          // shows a dash. (Could surface as its own column later.)
          break
      }
    }
    // % formula per §8.2: (present + late + excused + halfDay*0.5) / workingDays * 100.
    let pct: number | null = null
    if (workingDaysInMonth > 0) {
      pct = ((present + late + excused + halfDay * 0.5) / workingDaysInMonth) * 100
      // Round to 1 decimal to keep the wire payload tidy. The schema allows
      // any 0–100 float; the wire stays under 5 chars per cell.
      pct = Math.round(pct * 10) / 10
    }
    return {
      studentId: s.id,
      workingDays: workingDaysInMonth,
      present,
      absent,
      late,
      halfDay,
      excused,
      attendancePct: pct,
    }
  })

  // Wire-shape the records (include lock + anomaly flags).
  const recordsWire: AttendanceRecord[] = records.map(attendanceToWire)
  const studentsWire = studentRows.map(studentToWire)

  return {
    class: {
      id: cls.id,
      name: cls.name,
      teacherId: cls.teacherId,
      schoolId: cls.schoolId,
    },
    month,
    days,
    students: studentsWire,
    records: recordsWire,
    summaries,
  }
}
