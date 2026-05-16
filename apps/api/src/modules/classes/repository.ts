import { and, eq } from 'drizzle-orm'
import { db } from '../../db/client.js'
import { classes } from '../../db/schema/schools.js'
import { students } from '../../db/schema/students.js'
import { attendanceRecords } from '../../db/schema/attendance.js'
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
}
