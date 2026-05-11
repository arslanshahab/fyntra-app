import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

// Local mirror of the auth-relevant subset of User (README §5).
// The full shared User type and Zod schema land in src/types/schemas.ts
// during step 4 — this skeleton will swap to use that when it arrives.
export type AuthRole = 'parent' | 'admin' | 'teacher'

export interface AuthUser {
  id: string
  role: AuthRole
  fullName: string
  phone: string
  preferredLanguage: 'en' | 'ur'
  schoolId: string
}

interface AuthState {
  token: string | null
  user: AuthUser | null
  setAuth: (args: { token: string; user: AuthUser }) => void
  clearAuth: () => void
}

const STORAGE_KEY = 'fyntra:auth'

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      setAuth: ({ token, user }) => set({ token, user }),
      clearAuth: () => set({ token: null, user: null }),
    }),
    {
      name: STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
      // Only persist the credentials, not the setters.
      partialize: (state) => ({ token: state.token, user: state.user }),
    },
  ),
)
