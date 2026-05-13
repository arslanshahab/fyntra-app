import { type ReactNode } from 'react'
import { Navigate } from 'react-router-dom'

import { useAuthStore } from '../stores/auth'
import type { Role } from '@fyntra/schemas'

// Narrows RequireAuth: a logged-in parent visiting /admin would otherwise
// see admin UI rendered against their own data. RequireRole bounces them
// back to / where RoleRedirect dispatches to their actual home.
export function RequireRole({ role, children }: { role: Role; children: ReactNode }) {
  const user = useAuthStore((s) => s.user)
  if (!user) return <Navigate to="/login" replace />
  if (user.role !== role) return <Navigate to="/" replace />
  return <>{children}</>
}
