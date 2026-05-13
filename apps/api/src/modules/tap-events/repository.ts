import { and, desc, eq, gte } from 'drizzle-orm'
import { db } from '../../db/client.js'
import { tapEvents } from '../../db/schema/attendance.js'
import { newId } from '../../lib/ids.js'

export const tapEventsRepo = {
  async findRecentSameDirection(input: {
    schoolId: string
    deviceId: string
    rfidUid: string
    direction: 'in' | 'out'
    windowStart: Date
  }) {
    const rows = await db
      .select()
      .from(tapEvents)
      .where(
        and(
          eq(tapEvents.schoolId, input.schoolId),
          eq(tapEvents.deviceId, input.deviceId),
          eq(tapEvents.rfidUid, input.rfidUid),
          eq(tapEvents.direction, input.direction),
          gte(tapEvents.occurredAt, input.windowStart),
        ),
      )
      .orderBy(desc(tapEvents.occurredAt))
      .limit(1)
    return rows[0]
  },
  async insert(input: {
    schoolId: string
    cardId: string | null
    rfidUid: string
    deviceId: string
    studentId: string | null
    direction: 'in' | 'out'
    occurredAt: Date
    source: 'device' | 'manual'
    deduplicated?: boolean
    manualOverrideBy?: string
    manualReason?: string
  }) {
    const id = newId()
    await db.insert(tapEvents).values({ id, ...input, deduplicated: input.deduplicated ?? false })
    return id
  },
}
