import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import {
  createHolidayRequestSchema,
  patchHolidayRequestSchema,
} from '@fyntra/schemas'
import { requireAuth } from '../../middleware/require-auth.js'
import { requireRole } from '../../middleware/require-role.js'
import {
  createHoliday,
  deleteHoliday,
  listHolidays,
  patchHoliday,
} from './service.js'

const listQuery = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
})

export const holidaysRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    '/holidays',
    { preHandler: requireAuth, schema: { querystring: listQuery } },
    async (req) => {
      const ctx = req.tenantContext!
      const q = req.query as z.infer<typeof listQuery>
      return await listHolidays(ctx, q)
    },
  )

  app.post(
    '/holidays',
    {
      preHandler: [requireAuth, requireRole(['admin'])],
      schema: { body: createHolidayRequestSchema },
    },
    async (req) => {
      const ctx = req.tenantContext!
      const body = req.body as z.infer<typeof createHolidayRequestSchema>
      return await createHoliday(ctx, body)
    },
  )

  app.patch(
    '/holidays/:id',
    {
      preHandler: [requireAuth, requireRole(['admin'])],
      schema: { body: patchHolidayRequestSchema },
    },
    async (req) => {
      const ctx = req.tenantContext!
      const { id } = req.params as { id: string }
      const body = req.body as z.infer<typeof patchHolidayRequestSchema>
      return await patchHoliday(ctx, id, body)
    },
  )

  app.delete(
    '/holidays/:id',
    { preHandler: [requireAuth, requireRole(['admin'])] },
    async (req) => {
      const ctx = req.tenantContext!
      const { id } = req.params as { id: string }
      return await deleteHoliday(ctx, id)
    },
  )
}
