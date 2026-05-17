import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { requireAuth } from '../../middleware/require-auth.js'
import { resolvePagination, setNextCursor } from '../../lib/pagination.js'
import { listStudents, getStudent, getStudentTimeline } from './service.js'
import { getStudentAttendanceSummary } from './attendance-summary.service.js'

const listQuery = z.object({
  classId: z.string().optional(),
  search: z.string().optional(),
  guardianId: z.string().optional(),
  limit: z.coerce.number().int().min(1).optional(),
  cursor: z.string().min(1).optional(),
})

const timelineQuery = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
})

const summaryQuery = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/).optional(),
  year: z.string().regex(/^\d{4}$/).optional(),
})

export const studentsRoutes: FastifyPluginAsync = async (app) => {
  app.get('/students', { preHandler: requireAuth, schema: { querystring: listQuery } }, async (req, reply) => {
    const ctx = req.tenantContext!
    const q = req.query as z.infer<typeof listQuery>
    const { limit, cursor } = resolvePagination(q)
    const rows = await listStudents(ctx, {
      classId: q.classId,
      search: q.search,
      guardianId: q.guardianId,
      limit,
      cursor,
    })
    setNextCursor(reply, rows, limit)
    return rows
  })

  app.get('/students/:id', { preHandler: requireAuth }, async (req) => {
    const ctx = req.tenantContext!
    const { id } = req.params as { id: string }
    return await getStudent(ctx, id)
  })

  app.get(
    '/students/:id/timeline',
    { preHandler: requireAuth, schema: { querystring: timelineQuery } },
    async (req) => {
      const ctx = req.tenantContext!
      const { id } = req.params as { id: string }
      const { from, to } = req.query as z.infer<typeof timelineQuery>
      return await getStudentTimeline(ctx, id, from, to)
    },
  )

  // Per-student attendance summary (F8). Admin / teacher-of-class / parent-of.
  app.get(
    '/students/:id/attendance-summary',
    { preHandler: requireAuth, schema: { querystring: summaryQuery } },
    async (req) => {
      const ctx = req.tenantContext!
      const { id } = req.params as { id: string }
      const q = req.query as z.infer<typeof summaryQuery>
      return await getStudentAttendanceSummary(ctx, {
        studentId: id,
        month: q.month,
        year: q.year,
      })
    },
  )
}
