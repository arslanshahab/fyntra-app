import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import {
  assignCardRequestSchema,
  replaceCardRequestSchema,
  patchCardRequestSchema,
} from '@fyntra/schemas'
import { requireAuth } from '../../middleware/require-auth.js'
import { requireRole } from '../../middleware/require-role.js'
import { resolvePagination, setNextCursor } from '../../lib/pagination.js'
import {
  listCards,
  assignCard,
  replaceCard,
  patchCardStatus,
} from './service.js'

const listQuery = z.object({
  status: z.enum(['active', 'lost', 'replaced', 'deactivated']).optional(),
  limit: z.coerce.number().int().min(1).optional(),
  cursor: z.string().min(1).optional(),
})

export const cardsRoutes: FastifyPluginAsync = async (app) => {
  app.get('/cards', { preHandler: requireAuth, schema: { querystring: listQuery } }, async (req, reply) => {
    const ctx = req.tenantContext!
    const q = req.query as z.infer<typeof listQuery>
    const { limit, cursor } = resolvePagination(q)
    const rows = await listCards(ctx, { status: q.status, limit, cursor })
    setNextCursor(reply, rows, limit)
    return rows
  })

  app.post(
    '/cards/assign',
    {
      preHandler: [requireAuth, requireRole(['admin'])],
      schema: { body: assignCardRequestSchema },
    },
    async (req) => {
      const ctx = req.tenantContext!
      const body = req.body as z.infer<typeof assignCardRequestSchema>
      return await assignCard(ctx, body)
    },
  )

  app.post(
    '/cards/replace',
    {
      preHandler: [requireAuth, requireRole(['admin'])],
      schema: { body: replaceCardRequestSchema },
    },
    async (req) => {
      const ctx = req.tenantContext!
      const body = req.body as z.infer<typeof replaceCardRequestSchema>
      return await replaceCard(ctx, body)
    },
  )

  app.patch(
    '/cards/:id',
    {
      preHandler: [requireAuth, requireRole(['admin'])],
      schema: { body: patchCardRequestSchema },
    },
    async (req) => {
      const ctx = req.tenantContext!
      const { id } = req.params as { id: string }
      const { status } = req.body as z.infer<typeof patchCardRequestSchema>
      return await patchCardStatus(ctx, id, status)
    },
  )
}
