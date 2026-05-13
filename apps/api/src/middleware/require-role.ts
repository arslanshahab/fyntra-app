import type { FastifyRequest, FastifyReply } from 'fastify'
import type { Role } from '@fyntra/schemas'
import { ForbiddenError } from '../lib/errors.js'

export function requireRole(roles: Role[]) {
  return async (req: FastifyRequest, _reply: FastifyReply): Promise<void> => {
    if (!req.tenantContext) throw new ForbiddenError()
    if (!roles.includes(req.tenantContext.role)) throw new ForbiddenError()
  }
}
