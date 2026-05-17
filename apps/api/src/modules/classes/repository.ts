import { and, eq, inArray, isNull } from 'drizzle-orm'
import { db } from '../../db/client.js'
import { classes } from '../../db/schema/schools.js'
import { students } from '../../db/schema/students.js'
import { attendanceRecords } from '../../db/schema/attendance.js'
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
}
