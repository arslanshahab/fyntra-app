import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { createElement, type ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import { useRealtime } from './useRealtime'
import { useAuthStore } from '../stores/auth'

// ---- Mock WebSocket --------------------------------------------------------

interface IncomingMessage {
  data: string
}

class MockWS {
  static instances: MockWS[] = []
  static reset(): void {
    MockWS.instances = []
  }

  readyState = 0
  url: string
  closed = false
  onopen: (() => void) | null = null
  onmessage: ((e: IncomingMessage) => void) | null = null
  onclose: (() => void) | null = null
  onerror: (() => void) | null = null

  constructor(url: string) {
    this.url = url
    MockWS.instances.push(this)
  }

  close(): void {
    this.closed = true
    this.onclose?.()
  }

  receive(payload: unknown): void {
    this.onmessage?.({ data: JSON.stringify(payload) })
  }

  open(): void {
    this.readyState = 1
    this.onopen?.()
  }
}

// ---- Test harness ---------------------------------------------------------

function makeWrapper(): {
  wrapper: ({ children }: { children: ReactNode }) => ReactNode
  client: QueryClient
} {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const wrapper = ({ children }: { children: ReactNode }): ReactNode =>
    createElement(QueryClientProvider, { client }, children)
  return { wrapper, client }
}

beforeEach(() => {
  MockWS.reset()
  vi.stubGlobal('WebSocket', MockWS)
  useAuthStore.setState({ token: null, user: null })
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  useAuthStore.setState({ token: null, user: null })
})

// ---- Tests ----------------------------------------------------------------

describe('useRealtime', () => {
  it('returns refetchInterval: false', () => {
    vi.stubEnv('VITE_API_BASE_URL', 'http://localhost:3000')
    const { wrapper } = makeWrapper()
    const { result } = renderHook(() => useRealtime(undefined), { wrapper })
    expect(result.current.refetchInterval).toBe(false)
  })

  it('does not open a socket when token is null', () => {
    vi.stubEnv('VITE_API_BASE_URL', 'http://localhost:3000')
    const { wrapper } = makeWrapper()
    renderHook(() => useRealtime(undefined), { wrapper })
    expect(MockWS.instances).toHaveLength(0)
  })

  it('opens a WS to the derived ws:// URL when a token exists', () => {
    vi.stubEnv('VITE_API_BASE_URL', 'http://localhost:3000')
    useAuthStore.setState({ token: 'tok-abc', user: null })
    const { wrapper } = makeWrapper()
    renderHook(() => useRealtime(undefined), { wrapper })
    expect(MockWS.instances).toHaveLength(1)
    expect(MockWS.instances[0]!.url).toBe('ws://localhost:3000/ws?token=tok-abc')
  })

  it('does not open a socket when VITE_API_BASE_URL is empty', () => {
    vi.stubEnv('VITE_API_BASE_URL', '')
    useAuthStore.setState({ token: 'tok-abc', user: null })
    const { wrapper } = makeWrapper()
    renderHook(() => useRealtime(undefined), { wrapper })
    expect(MockWS.instances).toHaveLength(0)
  })

  it('invalidates ["attendance"] and ["tapEvents"] on a tap message', async () => {
    vi.stubEnv('VITE_API_BASE_URL', 'http://localhost:3000')
    useAuthStore.setState({ token: 'tok-tap', user: null })
    const { wrapper, client } = makeWrapper()
    const spy = vi.spyOn(client, 'invalidateQueries')

    renderHook(() => useRealtime(undefined), { wrapper })
    const ws = MockWS.instances[0]!
    act(() => {
      ws.receive({
        type: 'tap',
        schoolId: 'sch',
        studentId: 'stu',
        direction: 'in',
        occurredAt: '2026-05-14T07:30:00.000+05:00',
      })
    })

    const keys = spy.mock.calls.map((c) => c[0]?.queryKey)
    expect(keys).toEqual(expect.arrayContaining([['attendance'], ['tapEvents']]))
  })

  it('invalidates ["attendance"] on an absent message', () => {
    vi.stubEnv('VITE_API_BASE_URL', 'http://localhost:3000')
    useAuthStore.setState({ token: 'tok-abs', user: null })
    const { wrapper, client } = makeWrapper()
    const spy = vi.spyOn(client, 'invalidateQueries')

    renderHook(() => useRealtime(undefined), { wrapper })
    const ws = MockWS.instances[0]!
    act(() => {
      ws.receive({ type: 'absent', studentId: 'stu', date: '2026-05-14' })
    })

    const keys = spy.mock.calls.map((c) => c[0]?.queryKey)
    expect(keys).toEqual(expect.arrayContaining([['attendance']]))
    expect(keys).not.toEqual(expect.arrayContaining([['tapEvents']]))
  })

  it('closes the socket when the last consumer unmounts', () => {
    vi.stubEnv('VITE_API_BASE_URL', 'http://localhost:3000')
    useAuthStore.setState({ token: 'tok-close', user: null })
    const { wrapper } = makeWrapper()
    const { unmount } = renderHook(() => useRealtime(undefined), { wrapper })
    expect(MockWS.instances).toHaveLength(1)
    const ws = MockWS.instances[0]!
    expect(ws.closed).toBe(false)
    unmount()
    expect(ws.closed).toBe(true)
  })

  it('shares a single socket across multiple consumers (refcounts)', () => {
    vi.stubEnv('VITE_API_BASE_URL', 'http://localhost:3000')
    useAuthStore.setState({ token: 'tok-share', user: null })
    const { wrapper } = makeWrapper()
    const a = renderHook(() => useRealtime(undefined), { wrapper })
    const b = renderHook(() => useRealtime(undefined), { wrapper })
    expect(MockWS.instances).toHaveLength(1)
    const ws = MockWS.instances[0]!
    a.unmount()
    expect(ws.closed).toBe(false)
    b.unmount()
    expect(ws.closed).toBe(true)
  })
})
