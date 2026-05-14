import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { requireAuth } from '../../middleware/require-auth.js'
import { listClasses, classAttendanceForDay } from './service.js'

const attendanceQuery = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD'),
})

export const classesRoutes: FastifyPluginAsync = async (app) => {
  app.get('/classes', { preHandler: requireAuth }, async (req) => {
    const ctx = req.tenantContext!
    return await listClasses(ctx)
  })

  app.get(
    '/classes/:id/attendance',
    { preHandler: requireAuth, schema: { querystring: attendanceQuery } },
    async (req) => {
      const ctx = req.tenantContext!
      const { id } = req.params as { id: string }
      const { date } = req.query as z.infer<typeof attendanceQuery>
      return await classAttendanceForDay(ctx, id, date)
    },
  )
}
