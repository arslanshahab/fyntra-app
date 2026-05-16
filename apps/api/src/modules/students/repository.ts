import { and, asc, desc, eq, gte, ilike, inArray, isNull, lt, lte } from 'drizzle-orm'
import { db } from '../../db/client.js'
import { students, studentGuardians } from '../../db/schema/students.js'
import { attendanceRecords } from '../../db/schema/attendance.js'
import { users } from '../../db/schema/auth.js'
import { cards } from '../../db/schema/cards.js'
import type { TenantContext } from '../../types/tenant-context.js'

const studentWithCardCols = {
  id: students.id,
  schoolId: students.schoolId,
  classId: students.classId,
  fullName: students.fullName,
  rollNumber: students.rollNumber,
  photoUrl: students.photoUrl,
  status: students.status,
  cardId: cards.id,
}
const activeCardJoin = and(
  eq(cards.studentId, students.id),
  eq(cards.status, 'active'),
  isNull(cards.deletedAt),
)

export interface ListStudentsFilters {
  classId?: string
  search?: string
  guardianId?: string
  limit: number
  cursor?: string
}

export const studentsRepo = {
  async list(ctx: TenantContext, filters: ListStudentsFilters) {
    const conditions = [eq(students.schoolId, ctx.schoolId)]
    if (filters.classId) conditions.push(eq(students.classId, filters.classId))
    if (filters.search) conditions.push(ilike(students.fullName, `%${filters.search}%`))
    if (filters.cursor) conditions.push(lt(students.id, filters.cursor))

    let rows
    if (filters.guardianId) {
      const guardianId = filters.guardianId === 'me' ? ctx.userId : filters.guardianId
      const studentIdsSub = await db
        .select({ studentId: studentGuardians.studentId })
        .from(studentGuardians)
        .where(
          and(
            eq(studentGuardians.schoolId, ctx.schoolId),
            eq(studentGuardians.userId, guardianId),
          ),
        )
      const ids = studentIdsSub.map((r) => r.studentId)
      if (ids.length === 0) return []
      rows = await db
        .select(studentWithCardCols)
        .from(students)
        .leftJoin(cards, activeCardJoin)
        .where(and(...conditions, inArray(students.id, ids)))
        .orderBy(desc(students.id))
        .limit(filters.limit)
    } else {
      rows = await db
        .select(studentWithCardCols)
        .from(students)
        .leftJoin(cards, activeCardJoin)
        .where(and(...conditions))
        .orderBy(desc(students.id))
        .limit(filters.limit)
    }
    return rows
  },

  async findById(ctx: TenantContext, id: string) {
    const rows = await db
      .select(studentWithCardCols)
      .from(students)
      .leftJoin(cards, activeCardJoin)
      .where(and(eq(students.schoolId, ctx.schoolId), eq(students.id, id)))
      .limit(1)
    return rows[0]
  },

  async guardians(ctx: TenantContext, studentId: string) {
    return db
      .select({
        id: users.id,
        role: users.role,
        fullName: users.fullName,
        phone: users.phone,
        email: users.email,
        preferredLanguage: users.preferredLanguage,
        schoolId: users.schoolId,
      })
      .from(users)
      .innerJoin(studentGuardians, eq(studentGuardians.userId, users.id))
      .where(
        and(
          eq(studentGuardians.schoolId, ctx.schoolId),
          eq(studentGuardians.studentId, studentId),
        ),
      )
  },

  async guardianIds(ctx: TenantContext, studentId: string) {
    const rows = await db
      .select({ userId: studentGuardians.userId })
      .from(studentGuardians)
      .where(
        and(
          eq(studentGuardians.schoolId, ctx.schoolId),
          eq(studentGuardians.studentId, studentId),
        ),
      )
    return rows.map((r) => r.userId)
  },

  async timelineForStudent(ctx: TenantContext, studentId: string, from: string, to: string) {
    const rows = await db
      .select()
      .from(attendanceRecords)
      .where(
        and(
          eq(attendanceRecords.schoolId, ctx.schoolId),
          eq(attendanceRecords.studentId, studentId),
          gte(attendanceRecords.date, from),
          lte(attendanceRecords.date, to),
        ),
      )
      .orderBy(asc(attendanceRecords.date))
    return rows
  },

  async isGuardianOf(ctx: TenantContext, studentId: string) {
    const rows = await db
      .select({ studentId: studentGuardians.studentId })
      .from(studentGuardians)
      .where(
        and(
          eq(studentGuardians.schoolId, ctx.schoolId),
          eq(studentGuardians.userId, ctx.userId),
          eq(studentGuardians.studentId, studentId),
        ),
      )
      .limit(1)
    return rows.length > 0
  },
}
