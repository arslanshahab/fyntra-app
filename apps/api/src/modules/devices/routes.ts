import type { FastifyPluginAsync } from 'fastify'
import { requireAuth } from '../../middleware/require-auth.js'
import { listDevices, getDevice } from './service.js'

export const devicesRoutes: FastifyPluginAsync = async (app) => {
  app.get('/devices', { preHandler: requireAuth }, async (req) => {
    const ctx = req.tenantContext!
    return await listDevices(ctx)
  })

  app.get('/devices/:id', { preHandler: requireAuth }, async (req) => {
    const ctx = req.tenantContext!
    const { id } = req.params as { id: string }
    return await getDevice(ctx, id)
  })
}
