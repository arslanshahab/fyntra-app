import Fastify, { type FastifyInstance, type FastifyError, type FastifyRequest, type FastifyReply } from 'fastify'
import cors from '@fastify/cors'
import { serializerCompiler, validatorCompiler, type ZodTypeProvider } from 'fastify-type-provider-zod'
import { env } from './config/env.js'
import { buildLoggerOptions } from './lib/logger.js'
import { newRequestId } from './lib/ids.js'
import { AppError } from './lib/errors.js'
import { healthRoutes } from './modules/health/routes.js'

export async function buildApp(): Promise<FastifyInstance> {
  const e = env()
  const app = Fastify({
    logger: buildLoggerOptions(),
    genReqId: () => newRequestId(),
  }).withTypeProvider<ZodTypeProvider>()

  app.setValidatorCompiler(validatorCompiler)
  app.setSerializerCompiler(serializerCompiler)

  await app.register(cors, { origin: e.CORS_ORIGIN, credentials: true })

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

  return app
}
