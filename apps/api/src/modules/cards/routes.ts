import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import {
  assignCardRequestSchema,
  replaceCardRequestSchema,
  patchCardRequestSchema,
} from '@fyntra/schemas'
import { requireAuth } from '../../middleware/require-auth.js'
import { requireRole } from '../../middleware/require-role.js'
import {
  listCards,
  assignCard,
  replaceCard,
  patchCardStatus,
} from './service.js'

const listQuery = z.object({
  status: z.enum(['active', 'lost', 'replaced', 'deactivated']).optional(),
})

export const cardsRoutes: FastifyPluginAsync = async (app) => {
  app.get('/cards', { preHandler: requireAuth, schema: { querystring: listQuery } }, async (req) => {
    const ctx = req.tenantContext!
    const { status } = req.query as z.infer<typeof listQuery>
    return await listCards(ctx, status)
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
