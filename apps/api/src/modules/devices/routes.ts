import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import {
  createDeviceRequestSchema,
  patchDeviceRequestSchema,
  createDeviceTokenRequestSchema,
} from '@fyntra/schemas'
import { requireAuth } from '../../middleware/require-auth.js'
import { requireRole } from '../../middleware/require-role.js'
import {
  listDevices,
  getDevice,
  createDevice,
  patchDevice,
  softDeleteDevice,
} from './service.js'
import { listTokens, issueToken, revokeToken } from './tokens.service.js'

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

  app.post(
    '/devices',
    {
      preHandler: [requireAuth, requireRole(['admin'])],
      schema: { body: createDeviceRequestSchema },
    },
    async (req) => {
      const ctx = req.tenantContext!
      const body = req.body as z.infer<typeof createDeviceRequestSchema>
      return await createDevice(ctx, body)
    },
  )

  app.patch(
    '/devices/:id',
    {
      preHandler: [requireAuth, requireRole(['admin'])],
      schema: { body: patchDeviceRequestSchema },
    },
    async (req) => {
      const ctx = req.tenantContext!
      const { id } = req.params as { id: string }
      const body = req.body as z.infer<typeof patchDeviceRequestSchema>
      return await patchDevice(ctx, id, body)
    },
  )

  app.delete(
    '/devices/:id',
    { preHandler: [requireAuth, requireRole(['admin'])] },
    async (req) => {
      const ctx = req.tenantContext!
      const { id } = req.params as { id: string }
      return await softDeleteDevice(ctx, id)
    },
  )

  app.get(
    '/devices/:id/tokens',
    { preHandler: [requireAuth, requireRole(['admin'])] },
    async (req) => {
      const ctx = req.tenantContext!
      const { id } = req.params as { id: string }
      return await listTokens(ctx, id)
    },
  )

  app.post(
    '/devices/:id/tokens',
    {
      preHandler: [requireAuth, requireRole(['admin'])],
      schema: { body: createDeviceTokenRequestSchema },
    },
    async (req) => {
      const ctx = req.tenantContext!
      const { id } = req.params as { id: string }
      const body = req.body as z.infer<typeof createDeviceTokenRequestSchema>
      return await issueToken(ctx, id, body)
    },
  )

  app.delete(
    '/devices/:id/tokens/:tokenId',
    { preHandler: [requireAuth, requireRole(['admin'])] },
    async (req) => {
      const ctx = req.tenantContext!
      const { id, tokenId } = req.params as { id: string; tokenId: string }
      return await revokeToken(ctx, id, tokenId)
    },
  )
}
