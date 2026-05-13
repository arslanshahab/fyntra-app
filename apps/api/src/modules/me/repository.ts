import { and, eq } from 'drizzle-orm'
import { db } from '../../db/client.js'
import { schools, classes } from '../../db/schema/schools.js'
import { students, studentGuardians } from '../../db/schema/students.js'
import { users } from '../../db/schema/auth.js'
import type { TenantContext } from '../../types/tenant-context.js'

export const meRepo = {
  async user(ctx: TenantContext) {
    const rows = await db
      .select()
      .from(users)
      .where(and(eq(users.schoolId, ctx.schoolId), eq(users.id, ctx.userId)))
      .limit(1)
    return rows[0]
  },
  async school(ctx: TenantContext) {
    const rows = await db.select().from(schools).where(eq(schools.id, ctx.schoolId)).limit(1)
    return rows[0]
  },
  async children(ctx: TenantContext) {
    return db
      .select({
        id: students.id,
        fullName: students.fullName,
        rollNumber: students.rollNumber,
        classId: students.classId,
        schoolId: students.schoolId,
        photoUrl: students.photoUrl,
        status: students.status,
      })
      .from(students)
      .innerJoin(
        studentGuardians,
        and(
          eq(studentGuardians.studentId, students.id),
          eq(studentGuardians.userId, ctx.userId),
        ),
      )
      .where(eq(students.schoolId, ctx.schoolId))
  },
  async assignedClass(ctx: TenantContext) {
    const rows = await db
      .select()
      .from(classes)
      .where(and(eq(classes.schoolId, ctx.schoolId), eq(classes.teacherId, ctx.userId)))
      .limit(1)
    return rows[0]
  },
}
