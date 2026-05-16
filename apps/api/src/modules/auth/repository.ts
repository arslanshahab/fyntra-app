import { and, desc, eq, gt, isNull, sql } from 'drizzle-orm'
import { db } from '../../db/client.js'
import { otpCodes, users } from '../../db/schema/auth.js'
import { newId } from '../../lib/ids.js'

export interface OtpInsert {
  phone: string
  codeHash: string
  salt: string
  expiresAt: Date
}

export const authRepo = {
  async insertOtp(input: OtpInsert) {
    const id = newId()
    await db.insert(otpCodes).values({ id, ...input })
    return id
  },
  async findActiveOtp(phone: string, now: Date) {
    const rows = await db
      .select()
      .from(otpCodes)
      .where(
        and(
          eq(otpCodes.phone, phone),
          isNull(otpCodes.consumedAt),
          gt(otpCodes.expiresAt, now),
        ),
      )
      .orderBy(desc(otpCodes.createdAt))
      .limit(1)
    return rows[0]
  },
  async incrementOtpAttempts(id: string) {
    const rows = await db
      .update(otpCodes)
      .set({ attempts: sql`${otpCodes.attempts} + 1` })
      .where(eq(otpCodes.id, id))
      .returning({ attempts: otpCodes.attempts })
    return rows[0]?.attempts ?? 0
  },
  async markOtpConsumed(id: string, at: Date) {
    await db.update(otpCodes).set({ consumedAt: at }).where(eq(otpCodes.id, id))
  },
  async findUserByPhone(phone: string) {
    const rows = await db.select().from(users).where(eq(users.phone, phone)).limit(1)
    return rows[0]
  },
}
