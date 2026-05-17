import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import {
  createClassRequestSchema,
  registerLockRequestSchema,
  registerUnlockRequestSchema,
} from '@fyntra/schemas'
import { requireAuth } from '../../middleware/require-auth.js'
import { requireRole } from '../../middleware/require-role.js'
import {
  classAttendanceForDay,
  createClass,
  listClasses,
  lockRegisterForClass,
  registerForMonth,
  unlockRegisterForClass,
} from './service.js'

const attendanceQuery = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD'),
})

const registerQuery = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/, 'month must be YYYY-MM'),
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

  // Register lock — teacher-of-class or admin. Role gate lives in the
  // service so the (404 → 403) ordering stays correct (cross-tenant 404
  // beats a 403, matching the rest of the API).
  app.post(
    '/classes/:id/register/lock',
    { preHandler: requireAuth, schema: { body: registerLockRequestSchema } },
    async (req) => {
      const ctx = req.tenantContext!
      const { id } = req.params as { id: string }
      const { date } = req.body as z.infer<typeof registerLockRequestSchema>
      return await lockRegisterForClass(ctx, id, date)
    },
  )

  // Register unlock — admin only (service enforces).
  app.post(
    '/classes/:id/register/unlock',
    { preHandler: requireAuth, schema: { body: registerUnlockRequestSchema } },
    async (req) => {
      const ctx = req.tenantContext!
      const { id } = req.params as { id: string }
      const { date } = req.body as z.infer<typeof registerUnlockRequestSchema>
      return await unlockRegisterForClass(ctx, id, date)
    },
  )

  // Monthly register payload (F5). Teacher-of-class or admin (service gate).
  app.get(
    '/classes/:id/register',
    { preHandler: requireAuth, schema: { querystring: registerQuery } },
    async (req) => {
      const ctx = req.tenantContext!
      const { id } = req.params as { id: string }
      const { month } = req.query as z.infer<typeof registerQuery>
      return await registerForMonth(ctx, id, month)
    },
  )

  app.post(
    '/classes',
    {
      preHandler: [requireAuth, requireRole(['admin'])],
      schema: { body: createClassRequestSchema },
    },
    async (req) => {
      const ctx = req.tenantContext!
      const body = req.body as z.infer<typeof createClassRequestSchema>
      return await createClass(ctx, body)
    },
  )
}
