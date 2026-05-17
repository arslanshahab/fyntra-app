import { and, desc, eq, gte, lt, lte } from 'drizzle-orm'
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
    deviceId: string | null
    studentId: string | null
    direction: 'in' | 'out'
    occurredAt: Date
    source: 'device' | 'manual'
    deduplicated?: boolean
    manualOverrideBy?: string
    manualReason?: string
    manualReasonKind?:
      | 'forgot_card'
      | 'out_of_band_tap'
      | 'sick'
      | 'leave'
      | 'half_day'
      | 'early_pickup'
      | 'late_arrival'
      | 'in_school_not_in_class'
      | 'other'
  }) {
    const id = newId()
    await db.insert(tapEvents).values({ id, ...input, deduplicated: input.deduplicated ?? false })
    return id
  },
  async listForRange(input: {
    schoolId: string
    from?: Date
    to?: Date
    studentId?: string
    limit: number
    cursor?: string
  }) {
    const conds = [eq(tapEvents.schoolId, input.schoolId)]
    if (input.studentId) conds.push(eq(tapEvents.studentId, input.studentId))
    if (input.from) conds.push(gte(tapEvents.occurredAt, input.from))
    if (input.to) conds.push(lte(tapEvents.occurredAt, input.to))
    if (input.cursor) conds.push(lt(tapEvents.id, input.cursor))
    return db
      .select()
      .from(tapEvents)
      .where(and(...conds))
      .orderBy(desc(tapEvents.id))
      .limit(input.limit)
  },
}
