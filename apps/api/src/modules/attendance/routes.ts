import type { FastifyPluginAsync } from 'fastify'
import { requireAuth } from '../../middleware/require-auth.js'
import { requireRole } from '../../middleware/require-role.js'
import { getTodaySummary } from './today-summary.service.js'

export const attendanceRoutes: FastifyPluginAsync = async (app) => {
  // Admin-only rollup of today's per-class register state. Surfaces the
  // "X classes signed off, Y pending" line on the dashboard plus the
  // per-class totals card.
  app.get(
    '/attendance/today-summary',
    { preHandler: [requireAuth, requireRole(['admin'])] },
    async (req) => {
      const ctx = req.tenantContext!
      return await getTodaySummary(ctx)
    },
  )
}
