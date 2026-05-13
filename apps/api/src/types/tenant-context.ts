import type { Role } from '@fyntra/schemas'

export interface TenantContext {
  schoolId: string
  userId: string
  role: Role
}

export interface JwtPayload {
  userId: string
  schoolId: string
  role: Role
}
