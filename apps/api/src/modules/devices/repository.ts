import { and, eq, isNull } from 'drizzle-orm'
import { db } from '../../db/client.js'
import { devices } from '../../db/schema/devices.js'
import { newId } from '../../lib/ids.js'
import type { TenantContext } from '../../types/tenant-context.js'

type DeviceRow = typeof devices.$inferSelect
type DeviceDirection = DeviceRow['direction']

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

  async insert(
    ctx: TenantContext,
    input: { label: string; direction: DeviceDirection },
  ): Promise<DeviceRow> {
    const id = newId()
    const rows = await db
      .insert(devices)
      .values({
        id,
        schoolId: ctx.schoolId,
        label: input.label,
        direction: input.direction,
        status: 'offline',
      })
      .returning()
    return rows[0]!
  },

  async patch(
    ctx: TenantContext,
    id: string,
    input: { label?: string; direction?: DeviceDirection },
  ): Promise<DeviceRow | undefined> {
    const patch: Partial<Pick<DeviceRow, 'label' | 'direction'>> & { updatedAt: Date } = {
      updatedAt: new Date(),
    }
    if (input.label !== undefined) patch.label = input.label
    if (input.direction !== undefined) patch.direction = input.direction
    const rows = await db
      .update(devices)
      .set(patch)
      .where(
        and(
          eq(devices.schoolId, ctx.schoolId),
          eq(devices.id, id),
          isNull(devices.deletedAt),
        ),
      )
      .returning()
    return rows[0]
  },

  async softDelete(ctx: TenantContext, id: string): Promise<boolean> {
    const rows = await db
      .update(devices)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(devices.schoolId, ctx.schoolId),
          eq(devices.id, id),
          isNull(devices.deletedAt),
        ),
      )
      .returning({ id: devices.id })
    return rows.length > 0
  },
}
