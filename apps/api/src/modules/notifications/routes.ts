import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { idSchema, notificationSettingsSchema, type NotificationSettings } from '@fyntra/schemas'
import { requireAuth } from '../../middleware/require-auth.js'
import { requireRole } from '../../middleware/require-role.js'
import { resolvePagination, setNextCursor } from '../../lib/pagination.js'
import {
  getMySettings,
  updateMySettings,
  listNotifications,
  retryNotification,
} from './service.js'

const listQuery = z.object({
  userId: idSchema.optional(),
  status: z.enum(['queued', 'sent', 'delivered', 'failed']).optional(),
  limit: z.coerce.number().int().min(1).optional(),
  cursor: z.string().min(1).optional(),
})

export const notificationsRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    '/notifications',
    { preHandler: requireAuth, schema: { querystring: listQuery } },
    async (req, reply) => {
      const ctx = req.tenantContext!
      const q = req.query as z.infer<typeof listQuery>
      const { limit, cursor } = resolvePagination(q)
      const rows = await listNotifications(ctx, {
        userId: q.userId,
        status: q.status,
        limit,
        cursor,
      })
      setNextCursor(reply, rows, limit)
      return rows
    },
  )

  app.post(
    '/notifications/:id/retry',
    { preHandler: [requireAuth, requireRole(['admin', 'teacher'])] },
    async (req) => {
      const ctx = req.tenantContext!
      const { id } = req.params as { id: string }
      return await retryNotification(ctx, id)
    },
  )

  app.get(
    '/notifications/settings',
    { preHandler: requireAuth },
    async (req) => {
      const ctx = req.tenantContext!
      return await getMySettings(ctx)
    },
  )

  app.patch(
    '/notifications/settings',
    { preHandler: requireAuth, schema: { body: notificationSettingsSchema } },
    async (req) => {
      const ctx = req.tenantContext!
      const body = req.body as NotificationSettings
      return await updateMySettings(ctx, body, req.log)
    },
  )
}
