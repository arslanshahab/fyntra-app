import { and, desc, eq, lt } from 'drizzle-orm'
import { db } from '../../db/client.js'
import { notificationLogs, notificationSettings } from '../../db/schema/notifications.js'
import { newId } from '../../lib/ids.js'
import type { TenantContext } from '../../types/tenant-context.js'
import type { Role } from '@fyntra/schemas'

type SettingsInsert = typeof notificationSettings.$inferInsert
type SettingsRow = typeof notificationSettings.$inferSelect
type NotificationStatus = 'queued' | 'sent' | 'delivered' | 'failed'

export const notificationsRepo = {
  async findSettings(userId: string) {
    const rows = await db
      .select()
      .from(notificationSettings)
      .where(eq(notificationSettings.userId, userId))
      .limit(1)
    return rows[0]
  },

  async insertSettingsDefaults(input: { userId: string; schoolId: string; role: Role }) {
    const row: SettingsInsert = {
      userId: input.userId,
      schoolId: input.schoolId,
      whatsapp: true,
      sms: false,
      inApp: true,
      eventTapIn: true,
      eventTapOut: true,
      eventLate: true,
      eventAbsent: true,
      eventManualOverride: true,
      eventDeviceOffline: input.role !== 'parent',
    }
    await db.insert(notificationSettings).values(row)
    const found = await this.findSettings(input.userId)
    if (!found) throw new Error('failed to insert notification settings defaults')
    return found
  },

  async updateSettings(userId: string, patch: Partial<Omit<SettingsRow, 'userId' | 'schoolId' | 'createdAt'>>) {
    await db
      .update(notificationSettings)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(notificationSettings.userId, userId))
    const found = await this.findSettings(userId)
    if (!found) throw new Error('settings row vanished after update')
    return found
  },

  async insertLog(input: {
    schoolId: string
    recipientUserId: string
    channel: 'whatsapp' | 'sms' | 'in_app'
    eventId: string | null
    status: NotificationStatus
    payload: {
      title: string
      body: string
      errorMessage?: string
      templateName?: string
      variables?: string[]
      dryRun?: boolean
    }
    sentAt: Date | null
  }) {
    const id = newId()
    await db.insert(notificationLogs).values({ id, ...input })
    return id
  },

  async listLogs(
    ctx: TenantContext,
    filters: { userId?: string; status?: NotificationStatus; limit: number; cursor?: string },
  ) {
    const conds = [eq(notificationLogs.schoolId, ctx.schoolId)]
    if (filters.userId) conds.push(eq(notificationLogs.recipientUserId, filters.userId))
    if (filters.status) conds.push(eq(notificationLogs.status, filters.status))
    if (filters.cursor) conds.push(lt(notificationLogs.id, filters.cursor))
    return db
      .select()
      .from(notificationLogs)
      .where(and(...conds))
      .orderBy(desc(notificationLogs.id))
      .limit(filters.limit)
  },

  async findLog(ctx: TenantContext, id: string) {
    const rows = await db
      .select()
      .from(notificationLogs)
      .where(and(eq(notificationLogs.schoolId, ctx.schoolId), eq(notificationLogs.id, id)))
      .limit(1)
    return rows[0]
  },

  async markLogResent(ctx: TenantContext, id: string) {
    await db
      .update(notificationLogs)
      .set({ status: 'sent', sentAt: new Date() })
      .where(and(eq(notificationLogs.schoolId, ctx.schoolId), eq(notificationLogs.id, id)))
    return this.findLog(ctx, id)
  },

  async markLogResult(
    ctx: TenantContext,
    id: string,
    status: NotificationStatus,
    errorMessage?: string,
  ) {
    const existing = await this.findLog(ctx, id)
    if (!existing) return undefined
    const payload = errorMessage
      ? { ...existing.payload, errorMessage }
      : (() => {
          // strip any stale errorMessage on success
          const { errorMessage: _drop, ...rest } = existing.payload
          return rest
        })()
    await db
      .update(notificationLogs)
      .set({ status, sentAt: status === 'sent' ? new Date() : null, payload })
      .where(and(eq(notificationLogs.schoolId, ctx.schoolId), eq(notificationLogs.id, id)))
    return this.findLog(ctx, id)
  },
}
