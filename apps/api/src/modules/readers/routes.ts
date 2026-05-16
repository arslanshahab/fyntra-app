import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { ingestTap, heartbeat } from './service.js'

const tapBody = z.object({
  rfidUid: z.string().min(1),
  direction: z.enum(['in', 'out']),
  occurredAt: z.string().datetime(),
  deviceToken: z.string().min(1),
})

const heartbeatBody = z.object({
  occurredAt: z.string().datetime(),
  deviceToken: z.string().min(1),
})

export const readerRoutes: FastifyPluginAsync = async (app) => {
  app.post('/readers/tap', { schema: { body: tapBody } }, async (req) => {
    const b = req.body as z.infer<typeof tapBody>
    const result = await ingestTap({
      tokenPlain: b.deviceToken,
      rfidUid: b.rfidUid,
      direction: b.direction,
      occurredAt: new Date(b.occurredAt),
    })
    return {
      deduplicated: result.deduplicated,
      recordStatus: result.record?.status ?? null,
      notifications: result.notificationCount,
    }
  })

  app.post('/readers/heartbeat', { schema: { body: heartbeatBody } }, async (req) => {
    const b = req.body as z.infer<typeof heartbeatBody>
    await heartbeat(b.deviceToken, new Date(b.occurredAt))
    return { ok: true }
  })
}
