import { eq } from 'drizzle-orm'
import { db } from '../../db/client.js'
import { notificationLogs, notificationSettings } from '../../db/schema/notifications.js'
import { newId } from '../../lib/ids.js'

export const notificationsRepo = {
  async findSettings(userId: string) {
    const rows = await db
      .select()
      .from(notificationSettings)
      .where(eq(notificationSettings.userId, userId))
      .limit(1)
    return rows[0]
  },
  async insertLog(input: {
    schoolId: string
    recipientUserId: string
    channel: 'whatsapp' | 'sms' | 'in_app'
    eventId: string | null
    status: 'queued' | 'sent' | 'delivered' | 'failed'
    payload: { title: string; body: string; errorMessage?: string }
    sentAt: Date | null
  }) {
    const id = newId()
    await db.insert(notificationLogs).values({ id, ...input })
    return id
  },
}
