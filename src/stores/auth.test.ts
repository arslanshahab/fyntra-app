import { afterEach, describe, expect, it } from 'vitest'
import { type AuthUser, useAuthStore } from './auth'

const sampleUser: AuthUser = {
  id: 'u_1',
  role: 'parent',
  fullName: 'Ayesha Khan',
  phone: '+923001234567',
  preferredLanguage: 'en',
  schoolId: 's_1',
}

const initialState = useAuthStore.getState()

afterEach(() => {
  useAuthStore.setState(initialState, true)
  localStorage.clear()
})

describe('useAuthStore', () => {
  it('starts unauthenticated', () => {
    const state = useAuthStore.getState()
    expect(state.token).toBeNull()
    expect(state.user).toBeNull()
  })

  it('setAuth stores the token and user', () => {
    useAuthStore.getState().setAuth({ token: 'tok_abc', user: sampleUser })
    const state = useAuthStore.getState()
    expect(state.token).toBe('tok_abc')
    expect(state.user).toEqual(sampleUser)
  })

  it('clearAuth wipes credentials', () => {
    useAuthStore.getState().setAuth({ token: 'tok_abc', user: sampleUser })
    useAuthStore.getState().clearAuth()
    const state = useAuthStore.getState()
    expect(state.token).toBeNull()
    expect(state.user).toBeNull()
  })

  it('persists credentials to localStorage', () => {
    useAuthStore.getState().setAuth({ token: 'tok_abc', user: sampleUser })
    const raw = localStorage.getItem('fyntra:auth')
    expect(raw).not.toBeNull()
    const parsed = JSON.parse(raw as string) as { state: { token: string; user: AuthUser } }
    expect(parsed.state.token).toBe('tok_abc')
    expect(parsed.state.user.id).toBe('u_1')
  })
})
