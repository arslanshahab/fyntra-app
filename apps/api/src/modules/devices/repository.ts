import { and, eq, isNull } from 'drizzle-orm'
import { db } from '../../db/client.js'
import { devices } from '../../db/schema/devices.js'
import type { TenantContext } from '../../types/tenant-context.js'

export const devicesRepo = {
  async list(ctx: TenantContext) {
    return db
      .select()
      .from(devices)
      .where(and(eq(devices.schoolId, ctx.schoolId), isNull(devices.deletedAt)))
  },

  async findById(ctx: TenantContext, id: string) {
    const rows = await db
      .select()
      .from(devices)
      .where(
        and(
          eq(devices.schoolId, ctx.schoolId),
          eq(devices.id, id),
          isNull(devices.deletedAt),
        ),
      )
      .limit(1)
    return rows[0]
  },
}
