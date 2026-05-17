import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { patchSchoolRequestSchema } from '@fyntra/schemas'
import { requireAuth } from '../../middleware/require-auth.js'
import { requireRole } from '../../middleware/require-role.js'
import { patchSchoolForCaller } from './service.js'

export const schoolsRoutes: FastifyPluginAsync = async (app) => {
  app.patch(
    '/schools/me',
    {
      preHandler: [requireAuth, requireRole(['admin'])],
      schema: { body: patchSchoolRequestSchema },
    },
    async (req) => {
      const ctx = req.tenantContext!
      const body = req.body as z.infer<typeof patchSchoolRequestSchema>
      return await patchSchoolForCaller(ctx, body)
    },
  )
}
