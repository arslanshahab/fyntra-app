import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { requireAuth } from '../../middleware/require-auth.js'
import { requireRole } from '../../middleware/require-role.js'
import { listAttendance, attendanceCsv } from './service.js'

const listQuery = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  classId: z.string().optional(),
  // Explicit "true"/"false" rather than z.coerce.boolean() — the latter
  // treats any non-empty string as truthy (including "false"), which is a
  // common footgun for query-string booleans.
  anomalies: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
})

const csvQuery = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  classId: z.string().optional(),
})

export const reportsRoutes: FastifyPluginAsync = async (app) => {
  app.get('/attendance', { preHandler: requireAuth, schema: { querystring: listQuery } }, async (req) => {
    const ctx = req.tenantContext!
    const q = req.query as z.infer<typeof listQuery>
    return await listAttendance(ctx, q)
  })

  app.get(
    '/reports/attendance.csv',
    {
      preHandler: [requireAuth, requireRole(['admin', 'teacher'])],
      schema: { querystring: csvQuery },
    },
    async (req, reply) => {
      const ctx = req.tenantContext!
      const q = req.query as z.infer<typeof csvQuery>
      const csv = await attendanceCsv(ctx, q)
      reply.header('content-type', 'text/csv; charset=utf-8')
      reply.header(
        'content-disposition',
        `attachment; filename="attendance_${q.from}_${q.to}.csv"`,
      )
      return csv
    },
  )
}
