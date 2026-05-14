import { and, asc, eq, gte, inArray, lte } from 'drizzle-orm'
import { db } from '../../db/client.js'
import { attendanceRecords } from '../../db/schema/attendance.js'
import { students } from '../../db/schema/students.js'
import { classes } from '../../db/schema/schools.js'
import type { TenantContext } from '../../types/tenant-context.js'

export interface AttendanceFilters {
  date?: string
  from?: string
  to?: string
  classId?: string
}

export const reportsRepo = {
  async listRecords(ctx: TenantContext, filters: AttendanceFilters) {
    const conds = [eq(attendanceRecords.schoolId, ctx.schoolId)]
    if (filters.date) {
      conds.push(eq(attendanceRecords.date, filters.date))
    } else if (filters.from && filters.to) {
      conds.push(gte(attendanceRecords.date, filters.from))
      conds.push(lte(attendanceRecords.date, filters.to))
    }

    if (filters.classId) {
      // Verify class is in caller's school — caller code throws 404 if not.
      const studentRows = await db
        .select({ id: students.id })
        .from(students)
        .where(
          and(
            eq(students.schoolId, ctx.schoolId),
            eq(students.classId, filters.classId),
          ),
        )
      const ids = studentRows.map((s) => s.id)
      if (ids.length === 0) return []
      conds.push(inArray(attendanceRecords.studentId, ids))
    }

    return db
      .select()
      .from(attendanceRecords)
      .where(and(...conds))
      .orderBy(asc(attendanceRecords.date), asc(attendanceRecords.studentId))
  },

  async classExists(ctx: TenantContext, classId: string) {
    const rows = await db
      .select({ id: classes.id })
      .from(classes)
      .where(and(eq(classes.schoolId, ctx.schoolId), eq(classes.id, classId)))
      .limit(1)
    return rows.length > 0
  },

  async hydrationMaps(ctx: TenantContext, studentIds: string[]) {
    // Bulk-fetch students + their class names for CSV columns.
    if (studentIds.length === 0) return { students: new Map(), classes: new Map() }
    const studentRows = await db
      .select({ id: students.id, fullName: students.fullName, rollNumber: students.rollNumber, classId: students.classId })
      .from(students)
      .where(and(eq(students.schoolId, ctx.schoolId), inArray(students.id, studentIds)))
    const classIds = Array.from(new Set(studentRows.map((s) => s.classId)))
    const classRows = classIds.length > 0
      ? await db
          .select({ id: classes.id, name: classes.name })
          .from(classes)
          .where(and(eq(classes.schoolId, ctx.schoolId), inArray(classes.id, classIds)))
      : []
    return {
      students: new Map(studentRows.map((s) => [s.id, s])),
      classes: new Map(classRows.map((c) => [c.id, c.name])),
    }
  },
}
