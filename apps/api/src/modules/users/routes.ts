import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { requireAuth } from '../../middleware/require-auth.js'
import { requireRole } from '../../middleware/require-role.js'
import { listTeachersForPicker } from './service.js'

const listQuery = z.object({
  role: z.enum(['teacher']),
})

export const usersRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    '/users',
    {
      preHandler: [requireAuth, requireRole(['admin'])],
      schema: { querystring: listQuery },
    },
    async (req) => {
      const ctx = req.tenantContext!
      // Currently only the teacher picker uses this endpoint; role enum is
      // intentionally narrow so we don't ship a generic list by accident.
      // When admin user CRUD lands, widen the enum + branch here.
      void (req.query as z.infer<typeof listQuery>).role
      return await listTeachersForPicker(ctx)
    },
  )
}
