import type { FastifyRequest, FastifyReply } from 'fastify'
import { UnauthorizedError } from '../lib/errors.js'

export async function requireAuth(req: FastifyRequest, _reply: FastifyReply): Promise<void> {
  try {
    await req.jwtVerify()
  } catch {
    throw new UnauthorizedError('Invalid or missing token')
  }
  const payload = req.user
  req.tenantContext = {
    schoolId: payload.schoolId,
    userId: payload.userId,
    role: payload.role,
  }
}
