import { and, asc, eq, gte, inArray, isNull, lte } from 'drizzle-orm'
import { db } from '../../db/client.js'
import { classes } from '../../db/schema/schools.js'
import { students } from '../../db/schema/students.js'
import { attendanceRecords, tapEvents } from '../../db/schema/attendance.js'
import { schoolHolidays } from '../../db/schema/holidays.js'
import { newId } from '../../lib/ids.js'
import type { TenantContext } from '../../types/tenant-context.js'

export const classesRepo = {
  async list(ctx: TenantContext) {
    return db
      .select()
      .from(classes)
      .where(eq(classes.schoolId, ctx.schoolId))
  },

  async findById(ctx: TenantContext, id: string) {
    const rows = await db
      .select()
      .from(classes)
      .where(and(eq(classes.schoolId, ctx.schoolId), eq(classes.id, id)))
      .limit(1)
    return rows[0]
  },

  async attendanceForDay(ctx: TenantContext, classId: string, ymd: string) {
    const studentRows = await db
      .select({
        studentId: students.id,
        fullName: students.fullName,
        rollNumber: students.rollNumber,
      })
      .from(students)
      .where(
        and(
          eq(students.schoolId, ctx.schoolId),
          eq(students.classId, classId),
          eq(students.status, 'active'),
        ),
      )

    if (studentRows.length === 0) return []

    const records = await db
      .select()
      .from(attendanceRecords)
      .where(
        and(
          eq(attendanceRecords.schoolId, ctx.schoolId),
          eq(attendanceRecords.date, ymd),
        ),
      )
    const byStudent = new Map(records.map((r) => [r.studentId, r]))

    return studentRows.map((s) => ({
      studentId: s.studentId,
      fullName: s.fullName,
      rollNumber: s.rollNumber,
      record: byStudent.get(s.studentId) ?? null,
    }))
  },

  // --- Register lock helpers ---------------------------------------------

  // Active students in the class (used by lock to identify "missing" ones).
  async activeStudentIds(ctx: TenantContext, classId: string): Promise<string[]> {
    const rows = await db
      .select({ id: students.id })
      .from(students)
      .where(
        and(
          eq(students.schoolId, ctx.schoolId),
          eq(students.classId, classId),
          eq(students.status, 'active'),
        ),
      )
    return rows.map((r) => r.id)
  },

  // Records for (studentIds, date). Returns the full set so the service can
  // diff against `activeStudentIds` and figure out which students need an
  // absent backfill.
  async recordsForStudentsOnDate(ctx: TenantContext, studentIds: string[], ymd: string) {
    if (studentIds.length === 0) return []
    return db
      .select()
      .from(attendanceRecords)
      .where(
        and(
          eq(attendanceRecords.schoolId, ctx.schoolId),
          inArray(attendanceRecords.studentId, studentIds),
          eq(attendanceRecords.date, ymd),
        ),
      )
  },

  // Insert absent rows for students missing one on `ymd`. Caller has already
  // filtered the list; we just bulk-insert.
  async insertAbsentRows(
    ctx: TenantContext,
    studentIds: string[],
    ymd: string,
  ) {
    if (studentIds.length === 0) return
    await db.insert(attendanceRecords).values(
      studentIds.map((studentId) => ({
        id: newId(),
        schoolId: ctx.schoolId,
        studentId,
        date: ymd,
        firstInAt: null,
        lastOutAt: null,
        status: 'absent' as const,
        isManual: true,
      })),
    )
  },

  // Mark every record for (studentIds, date) as locked. Only updates rows
  // that aren't already locked (so an idempotent re-lock doesn't churn
  // lockedAt/lockedBy and re-attribute the day to a different user).
  async lockRecords(
    ctx: TenantContext,
    studentIds: string[],
    ymd: string,
    lockedBy: string,
    lockedAt: Date,
  ) {
    if (studentIds.length === 0) return
    await db
      .update(attendanceRecords)
      .set({ lockedAt, lockedBy, updatedAt: new Date() })
      .where(
        and(
          eq(attendanceRecords.schoolId, ctx.schoolId),
          inArray(attendanceRecords.studentId, studentIds),
          eq(attendanceRecords.date, ymd),
          isNull(attendanceRecords.lockedAt),
        ),
      )
  },

  // Clear lockedAt/lockedBy on the class's records for that date.
  async unlockRecords(ctx: TenantContext, studentIds: string[], ymd: string) {
    if (studentIds.length === 0) return
    await db
      .update(attendanceRecords)
      .set({ lockedAt: null, lockedBy: null, updatedAt: new Date() })
      .where(
        and(
          eq(attendanceRecords.schoolId, ctx.schoolId),
          inArray(attendanceRecords.studentId, studentIds),
          eq(attendanceRecords.date, ymd),
        ),
      )
  },

  // --- Monthly register helpers ------------------------------------------

  // Active students in the class with the full student row — needed for the
  // monthly register response shape.
  async activeStudentRows(ctx: TenantContext, classId: string) {
    return db
      .select()
      .from(students)
      .where(
        and(
          eq(students.schoolId, ctx.schoolId),
          eq(students.classId, classId),
          eq(students.status, 'active'),
        ),
      )
      .orderBy(asc(students.rollNumber))
  },

  // Attendance records for (students, date range). Used by the monthly
  // register to build the grid + per-student summaries.
  async recordsForStudentsInRange(
    ctx: TenantContext,
    studentIds: string[],
    fromYmd: string,
    toYmd: string,
  ) {
    if (studentIds.length === 0) return []
    return db
      .select()
      .from(attendanceRecords)
      .where(
        and(
          eq(attendanceRecords.schoolId, ctx.schoolId),
          inArray(attendanceRecords.studentId, studentIds),
          gte(attendanceRecords.date, fromYmd),
          lte(attendanceRecords.date, toYmd),
        ),
      )
  },

  // Holidays in [from, to] for the caller's school.
  async holidaysForRange(ctx: TenantContext, fromYmd: string, toYmd: string) {
    return db
      .select()
      .from(schoolHolidays)
      .where(
        and(
          eq(schoolHolidays.schoolId, ctx.schoolId),
          gte(schoolHolidays.date, fromYmd),
          lte(schoolHolidays.date, toYmd),
        ),
      )
      .orderBy(asc(schoolHolidays.date))
  },

  // For each (studentId, occurredAt-day) returns a `Set` of "studentId|ymd"
  // keys where a manual tap-event carried a sick/leave reason kind. The
  // monthly-summary uses this to distinguish "excused absent" from plain
  // absent. We range-filter in JS to avoid drizzle date-vs-timestamp casting
  // tangles for this prototype.
  async excusedKeysInRange(
    ctx: TenantContext,
    studentIds: string[],
    fromYmd: string,
    toYmd: string,
  ): Promise<Set<string>> {
    if (studentIds.length === 0) return new Set()
    const rows = await db
      .select({
        studentId: tapEvents.studentId,
        occurredAt: tapEvents.occurredAt,
        kind: tapEvents.manualReasonKind,
      })
      .from(tapEvents)
      .where(
        and(
          eq(tapEvents.schoolId, ctx.schoolId),
          eq(tapEvents.source, 'manual'),
          inArray(tapEvents.studentId, studentIds),
        ),
      )
    const fromMs = new Date(`${fromYmd}T00:00:00+05:00`).getTime()
    const toMs = new Date(`${toYmd}T23:59:59+05:00`).getTime()
    const keys = new Set<string>()
    for (const r of rows) {
      if (!r.studentId || !r.kind) continue
      if (r.kind !== 'sick' && r.kind !== 'leave') continue
      const ts = r.occurredAt.getTime()
      if (ts < fromMs || ts > toMs) continue
      // Karachi calendar date for the tap.
      const local = new Date(r.occurredAt.getTime() + 5 * 60 * 60 * 1000)
      const ymd = `${local.getUTCFullYear()}-${String(local.getUTCMonth() + 1).padStart(2, '0')}-${String(local.getUTCDate()).padStart(2, '0')}`
      keys.add(`${r.studentId}|${ymd}`)
    }
    return keys
  },
}
