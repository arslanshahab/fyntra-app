import { and, asc, desc, eq, isNull, lt } from 'drizzle-orm'
import { db } from '../../db/client.js'
import { cards, cardAuditEntries } from '../../db/schema/cards.js'
import { students } from '../../db/schema/students.js'
import { newId } from '../../lib/ids.js'
import type { TenantContext } from '../../types/tenant-context.js'

type CardStatus = 'active' | 'lost' | 'replaced' | 'deactivated'
type AuditAction = 'issued' | 'assigned' | 'replaced' | 'lost' | 'deactivated' | 'reactivated'

export interface ListCardsFilters {
  status?: CardStatus
  limit: number
  cursor?: string
}

export const cardsRepo = {
  async list(ctx: TenantContext, filters: ListCardsFilters) {
    const conds = [eq(cards.schoolId, ctx.schoolId), isNull(cards.deletedAt)]
    if (filters.status) conds.push(eq(cards.status, filters.status))
    if (filters.cursor) conds.push(lt(cards.id, filters.cursor))
    return db
      .select()
      .from(cards)
      .where(and(...conds))
      .orderBy(desc(cards.id))
      .limit(filters.limit)
  },

  async findById(ctx: TenantContext, id: string) {
    const rows = await db
      .select()
      .from(cards)
      .where(
        and(
          eq(cards.schoolId, ctx.schoolId),
          eq(cards.id, id),
          isNull(cards.deletedAt),
        ),
      )
      .limit(1)
    return rows[0]
  },

  async findActiveByStudent(ctx: TenantContext, studentId: string) {
    const rows = await db
      .select()
      .from(cards)
      .where(
        and(
          eq(cards.schoolId, ctx.schoolId),
          eq(cards.studentId, studentId),
          eq(cards.status, 'active'),
          isNull(cards.deletedAt),
        ),
      )
      .limit(1)
    return rows[0]
  },

  async studentExists(ctx: TenantContext, studentId: string) {
    const rows = await db
      .select({ id: students.id })
      .from(students)
      .where(and(eq(students.schoolId, ctx.schoolId), eq(students.id, studentId)))
      .limit(1)
    return rows.length > 0
  },

  async updateStatus(ctx: TenantContext, id: string, status: CardStatus, studentId?: string) {
    const update: { status: CardStatus; updatedAt: Date; studentId?: string } = {
      status,
      updatedAt: new Date(),
    }
    if (studentId !== undefined) update.studentId = studentId
    await db
      .update(cards)
      .set(update)
      .where(and(eq(cards.schoolId, ctx.schoolId), eq(cards.id, id)))
  },

  async insertCard(ctx: TenantContext, input: { rfidUid: string; studentId: string }) {
    const id = newId()
    await db.insert(cards).values({
      id,
      schoolId: ctx.schoolId,
      rfidUid: input.rfidUid,
      studentId: input.studentId,
      status: 'active',
    })
    return id
  },

  async appendAudit(ctx: TenantContext, cardId: string, action: AuditAction, note?: string) {
    await db.insert(cardAuditEntries).values({
      id: newId(),
      schoolId: ctx.schoolId,
      cardId,
      byUserId: ctx.userId,
      action,
      note,
    })
  },

  async auditFor(ctx: TenantContext, cardId: string) {
    return db
      .select()
      .from(cardAuditEntries)
      .where(
        and(
          eq(cardAuditEntries.schoolId, ctx.schoolId),
          eq(cardAuditEntries.cardId, cardId),
        ),
      )
      .orderBy(asc(cardAuditEntries.at))
  },
}
