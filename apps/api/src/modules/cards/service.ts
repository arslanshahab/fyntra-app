import { NotFoundError, ValidationError } from '../../lib/errors.js'
import type { TenantContext } from '../../types/tenant-context.js'
import { cardsRepo, type ListCardsFilters } from './repository.js'

type CardStatus = 'active' | 'lost' | 'replaced' | 'deactivated'

async function hydrateOne(ctx: TenantContext, cardId: string) {
  const card = await cardsRepo.findById(ctx, cardId)
  if (!card) throw new NotFoundError('Card not found')
  const auditLog = await cardsRepo.auditFor(ctx, cardId)
  return toWire(card, auditLog)
}

function toWire(
  card: NonNullable<Awaited<ReturnType<typeof cardsRepo.findById>>>,
  audit: Awaited<ReturnType<typeof cardsRepo.auditFor>>,
) {
  return {
    id: card.id,
    rfidUid: card.rfidUid,
    studentId: card.studentId ?? undefined,
    status: card.status,
    issuedAt: card.issuedAt.toISOString(),
    auditLog: audit.map((a) => ({
      at: a.at.toISOString(),
      byUserId: a.byUserId,
      action: a.action,
      note: a.note ?? undefined,
    })),
  }
}

export async function listCards(ctx: TenantContext, filters: ListCardsFilters) {
  const rows = await cardsRepo.list(ctx, filters)
  const out = await Promise.all(
    rows.map(async (c) => {
      const audit = await cardsRepo.auditFor(ctx, c.id)
      return toWire(c, audit)
    }),
  )
  return out
}

export async function assignCard(
  ctx: TenantContext,
  input: { cardId: string; studentId: string },
) {
  const card = await cardsRepo.findById(ctx, input.cardId)
  if (!card) throw new NotFoundError('Card not found')
  const studentExists = await cardsRepo.studentExists(ctx, input.studentId)
  if (!studentExists) throw new NotFoundError('Student not found')

  // If the student already has an active card, mark it replaced.
  const existingActive = await cardsRepo.findActiveByStudent(ctx, input.studentId)
  if (existingActive && existingActive.id !== input.cardId) {
    await cardsRepo.updateStatus(ctx, existingActive.id, 'replaced')
    await cardsRepo.appendAudit(ctx, existingActive.id, 'replaced')
  }

  await cardsRepo.updateStatus(ctx, input.cardId, 'active', input.studentId)
  await cardsRepo.appendAudit(ctx, input.cardId, 'assigned')

  return await hydrateOne(ctx, input.cardId)
}

export async function replaceCard(
  ctx: TenantContext,
  input: { studentId: string; newRfidUid: string },
) {
  if (!input.newRfidUid.trim()) throw new ValidationError('newRfidUid required')
  const studentExists = await cardsRepo.studentExists(ctx, input.studentId)
  if (!studentExists) throw new NotFoundError('Student not found')

  const old = await cardsRepo.findActiveByStudent(ctx, input.studentId)
  if (old) {
    await cardsRepo.updateStatus(ctx, old.id, 'replaced')
    await cardsRepo.appendAudit(ctx, old.id, 'replaced')
  }

  const newCardId = await cardsRepo.insertCard(ctx, {
    rfidUid: input.newRfidUid,
    studentId: input.studentId,
  })
  await cardsRepo.appendAudit(ctx, newCardId, 'issued')

  return await hydrateOne(ctx, newCardId)
}

const STATUS_TO_ACTION: Record<CardStatus, 'reactivated' | 'lost' | 'replaced' | 'deactivated'> = {
  active: 'reactivated',
  lost: 'lost',
  replaced: 'replaced',
  deactivated: 'deactivated',
}

export async function patchCardStatus(
  ctx: TenantContext,
  id: string,
  status: CardStatus,
) {
  const card = await cardsRepo.findById(ctx, id)
  if (!card) throw new NotFoundError('Card not found')
  await cardsRepo.updateStatus(ctx, id, status)
  await cardsRepo.appendAudit(ctx, id, STATUS_TO_ACTION[status])
  return await hydrateOne(ctx, id)
}
