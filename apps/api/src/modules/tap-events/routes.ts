import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { manualTapEventRequestSchema } from '@fyntra/schemas'
import { requireAuth } from '../../middleware/require-auth.js'
import { requireRole } from '../../middleware/require-role.js'
import { resolvePagination, setNextCursor } from '../../lib/pagination.js'
import { listTapEvents, recordManualOverride } from './service.js'

const listQuery = z.object({
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
  studentId: z.string().optional(),
  limit: z.coerce.number().int().min(1).optional(),
  cursor: z.string().min(1).optional(),
})

export const tapEventsRoutes: FastifyPluginAsync = async (app) => {
  app.get('/tap-events', { preHandler: requireAuth, schema: { querystring: listQuery } }, async (req, reply) => {
    const ctx = req.tenantContext!
    const q = req.query as z.infer<typeof listQuery>
    const { limit, cursor } = resolvePagination(q)
    const rows = await listTapEvents(ctx, {
      from: q.from,
      to: q.to,
      studentId: q.studentId,
      limit,
      cursor,
    })
    setNextCursor(reply, rows, limit)
    return rows
  })

  app.post(
    '/tap-events/manual',
    {
      preHandler: [requireAuth, requireRole(['admin', 'teacher'])],
      schema: { body: manualTapEventRequestSchema },
    },
    async (req) => {
      const ctx = req.tenantContext!
      const body = req.body as z.infer<typeof manualTapEventRequestSchema>
      return await recordManualOverride(ctx, body)
    },
  )
}
