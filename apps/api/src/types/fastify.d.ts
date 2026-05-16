import type { TenantContext, JwtPayload } from './tenant-context.js'

declare module 'fastify' {
  interface FastifyRequest {
    tenantContext?: TenantContext
  }
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: JwtPayload
    user: JwtPayload
  }
}
