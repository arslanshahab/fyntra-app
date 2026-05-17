import { and, asc, eq } from 'drizzle-orm'
import { db } from '../../db/client.js'
import { users } from '../../db/schema/auth.js'
import type { TenantContext } from '../../types/tenant-context.js'

export const usersRepo = {
  async listTeachers(ctx: TenantContext) {
    return db
      .select({ id: users.id, fullName: users.fullName })
      .from(users)
      .where(and(eq(users.schoolId, ctx.schoolId), eq(users.role, 'teacher')))
      .orderBy(asc(users.fullName))
  },
}
