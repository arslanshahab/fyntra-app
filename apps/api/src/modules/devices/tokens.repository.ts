import { and, eq, desc, isNull } from 'drizzle-orm'
import { db } from '../../db/client.js'
import { deviceTokens } from '../../db/schema/devices.js'
import { newId } from '../../lib/ids.js'
import type { TenantContext } from '../../types/tenant-context.js'

type DeviceTokenRow = typeof deviceTokens.$inferSelect

export const deviceTokensRepo = {
  async listForDevice(ctx: TenantContext, deviceId: string): Promise<DeviceTokenRow[]> {
    return db
      .select()
      .from(deviceTokens)
      .where(
        and(
          eq(deviceTokens.schoolId, ctx.schoolId),
          eq(deviceTokens.deviceId, deviceId),
        ),
      )
      .orderBy(desc(deviceTokens.createdAt))
  },

  async insertHashed(
    ctx: TenantContext,
    deviceId: string,
    tokenHash: string,
    label: string,
  ): Promise<DeviceTokenRow> {
    const id = newId()
    const rows = await db
      .insert(deviceTokens)
      .values({
        id,
        schoolId: ctx.schoolId,
        deviceId,
        tokenHash,
        label,
      })
      .returning()
    return rows[0]!
  },

  async findById(
    ctx: TenantContext,
    deviceId: string,
    tokenId: string,
  ): Promise<DeviceTokenRow | undefined> {
    const rows = await db
      .select()
      .from(deviceTokens)
      .where(
        and(
          eq(deviceTokens.schoolId, ctx.schoolId),
          eq(deviceTokens.deviceId, deviceId),
          eq(deviceTokens.id, tokenId),
        ),
      )
      .limit(1)
    return rows[0]
  },

  async revoke(
    ctx: TenantContext,
    deviceId: string,
    tokenId: string,
  ): Promise<DeviceTokenRow | undefined> {
    const rows = await db
      .update(deviceTokens)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(deviceTokens.schoolId, ctx.schoolId),
          eq(deviceTokens.deviceId, deviceId),
          eq(deviceTokens.id, tokenId),
        ),
      )
      .returning()
    return rows[0]
  },

  async revokeAllForDevice(ctx: TenantContext, deviceId: string): Promise<number> {
    const rows = await db
      .update(deviceTokens)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(deviceTokens.schoolId, ctx.schoolId),
          eq(deviceTokens.deviceId, deviceId),
          isNull(deviceTokens.revokedAt),
        ),
      )
      .returning({ id: deviceTokens.id })
    return rows.length
  },
}
