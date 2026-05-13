import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { requireAuth } from '../../middleware/require-auth.js'
import { listStudents, getStudent } from './service.js'

const listQuery = z.object({
  classId: z.string().optional(),
  search: z.string().optional(),
  guardianId: z.string().optional(),
})

export const studentsRoutes: FastifyPluginAsync = async (app) => {
  app.get('/students', { preHandler: requireAuth, schema: { querystring: listQuery } }, async (req) => {
    const ctx = req.tenantContext!
    const q = req.query as z.infer<typeof listQuery>
    return await listStudents(ctx, q)
  })

  app.get('/students/:id', { preHandler: requireAuth }, async (req) => {
    const ctx = req.tenantContext!
    const { id } = req.params as { id: string }
    return await getStudent(ctx, id)
  })
}
