import { Navigate } from 'react-router-dom'

import { useAuthStore } from '../stores/auth'

// Dispatches '/' to the user's role-home. Used as the index route under
// the auth-required tree, so an authenticated visit to '/' always lands
// on the right home for who they are.
export function RoleRedirect() {
  const user = useAuthStore((s) => s.user)
  if (!user) return <Navigate to="/login" replace />
  switch (user.role) {
    case 'parent':
      return <Navigate to="/parent" replace />
    case 'admin':
      return <Navigate to="/admin" replace />
    case 'teacher':
      return <Navigate to="/teacher" replace />
  }
}
