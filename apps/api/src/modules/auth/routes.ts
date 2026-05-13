import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import {
  requestOtpRequestSchema,
  verifyOtpRequestSchema,
  verifyOtpResponseSchema,
  okResponseSchema,
} from '@fyntra/schemas'
import { requestOtp, verifyOtp } from './service.js'

export const authRoutes: FastifyPluginAsync = async (app) => {
  app.post(
    '/auth/request-otp',
    {
      schema: {
        body: requestOtpRequestSchema,
        response: { 200: okResponseSchema },
      },
      config: {
        rateLimit: {
          max: 5,
          timeWindow: '1 hour',
          keyGenerator: (req) => (req.body as { phone?: string })?.phone ?? req.ip,
        },
      },
    },
    async (req) => {
      const { phone } = req.body as z.infer<typeof requestOtpRequestSchema>
      return await requestOtp(phone)
    },
  )

  app.post(
    '/auth/verify-otp',
    {
      schema: {
        body: verifyOtpRequestSchema,
        response: { 200: verifyOtpResponseSchema },
      },
      config: {
        rateLimit: { max: 10, timeWindow: '15 minutes' },
      },
    },
    async (req) => {
      const { phone, otp } = req.body as z.infer<typeof verifyOtpRequestSchema>
      const result = await verifyOtp(phone, otp)
      const token = app.jwt.sign(
        { userId: result.userId, schoolId: result.schoolId, role: result.role },
        { expiresIn: '30d' },
      )
      return { token, user: result.user }
    },
  )
}
