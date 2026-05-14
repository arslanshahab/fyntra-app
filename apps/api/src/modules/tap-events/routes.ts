import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { manualTapEventRequestSchema } from '@fyntra/schemas'
import { requireAuth } from '../../middleware/require-auth.js'
import { requireRole } from '../../middleware/require-role.js'
import { listTapEvents, recordManualOverride } from './service.js'

const listQuery = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  studentId: z.string().optional(),
})

export const tapEventsRoutes: FastifyPluginAsync = async (app) => {
  app.get('/tap-events', { preHandler: requireAuth, schema: { querystring: listQuery } }, async (req) => {
    const ctx = req.tenantContext!
    const q = req.query as z.infer<typeof listQuery>
    return await listTapEvents(ctx, q)
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
