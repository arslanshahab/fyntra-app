import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

import type { User } from '@fyntra/schemas'

interface AuthState {
  token: string | null
  user: User | null
  setAuth: (args: { token: string; user: User }) => void
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
      // Only persist credentials, not setters.
      partialize: (state) => ({ token: state.token, user: state.user }),
    },
  ),
)
