import Fastify, { type FastifyInstance, type FastifyError, type FastifyRequest, type FastifyReply } from 'fastify'
import cors from '@fastify/cors'
import jwt from '@fastify/jwt'
import rateLimit from '@fastify/rate-limit'
import { serializerCompiler, validatorCompiler, type ZodTypeProvider } from 'fastify-type-provider-zod'
import { env } from './config/env.js'
import { buildLoggerOptions } from './lib/logger.js'
import { newRequestId } from './lib/ids.js'
import { AppError } from './lib/errors.js'
import { healthRoutes } from './modules/health/routes.js'
import { authRoutes } from './modules/auth/routes.js'
import { meRoutes } from './modules/me/routes.js'
import { studentsRoutes } from './modules/students/routes.js'
import { classesRoutes } from './modules/classes/routes.js'
import { devicesRoutes } from './modules/devices/routes.js'
import { cardsRoutes } from './modules/cards/routes.js'
import { readerRoutes } from './modules/readers/routes.js'
import { tapEventsRoutes } from './modules/tap-events/routes.js'
import { reportsRoutes } from './modules/reports/routes.js'
import { notificationsRoutes } from './modules/notifications/routes.js'
import { holidaysRoutes } from './modules/holidays/routes.js'
import { wsRoutes } from './ws/routes.js'
import { bootstrapAbsentJobs } from './services/attendance-jobs.js'
import { startHeartbeatSweep } from './services/heartbeat-sweep.js'

export async function buildApp(): Promise<FastifyInstance> {
  const e = env()
  const app = Fastify({
    logger: buildLoggerOptions(),
    genReqId: () => newRequestId(),
  }).withTypeProvider<ZodTypeProvider>()

  app.setValidatorCompiler(validatorCompiler)
  app.setSerializerCompiler(serializerCompiler)

  await app.register(cors, { origin: e.CORS_ORIGIN, credentials: false })
  await app.register(jwt, { secret: e.JWT_SECRET })
  await app.register(rateLimit, { global: true, max: 100, timeWindow: '1 minute' })

  app.addHook('onSend', async (req, reply) => {
    reply.header('x-request-id', req.id)
  })

  app.setErrorHandler((err: FastifyError, _req: FastifyRequest, reply: FastifyReply) => {
    const requestId = _req.id
    if (err instanceof AppError) {
      reply.status(err.statusCode).send({
        statusCode: err.statusCode,
        error: err.name,
        message: err.message,
        code: err.code,
        requestId,
      })
      return
    }
    if (err.statusCode && err.statusCode < 500) {
      reply.status(err.statusCode).send({
        statusCode: err.statusCode,
        error: err.name ?? 'Error',
        message: err.message,
        requestId,
      })
      return
    }
    _req.log.error({ err }, 'unhandled error')
    reply.status(500).send({
      statusCode: 500,
      error: 'InternalServerError',
      message: 'Internal Server Error',
      requestId,
    })
  })

  await app.register(healthRoutes)
  await app.register(authRoutes)
  await app.register(meRoutes)
  await app.register(studentsRoutes)
  await app.register(classesRoutes)
  await app.register(devicesRoutes)
  await app.register(cardsRoutes)
  await app.register(readerRoutes)
  await app.register(tapEventsRoutes)
  await app.register(reportsRoutes)
  await app.register(notificationsRoutes)
  await app.register(holidaysRoutes)
  await app.register(wsRoutes)

  if (env().NODE_ENV !== 'test') {
    await bootstrapAbsentJobs()
    startHeartbeatSweep()
  }

  return app
}
