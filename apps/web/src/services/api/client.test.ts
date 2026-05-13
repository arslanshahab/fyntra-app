import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { setupServer } from 'msw/node'
import { http, HttpResponse } from 'msw'
import { z } from 'zod'

import { useAuthStore } from '../../stores/auth'
import { ApiError, apiGet, apiPost } from './client'

const responseSchema = z.object({ value: z.number() })

// API_BASE matches the default in client.ts. We rely on the relative-path
// default so VITE_API_BASE_URL doesn't need to be set in tests.
const BASE = '*/api'

const handlers = [
  http.get(`${BASE}/echo`, () => HttpResponse.json({ value: 42 })),
  http.post(`${BASE}/echo`, async ({ request }) => HttpResponse.json(await request.json())),
  http.get(`${BASE}/bad-shape`, () => HttpResponse.json({ value: 'not-a-number' })),
  http.get(`${BASE}/needs-auth`, ({ request }) => {
    const auth = request.headers.get('authorization')
    if (auth === 'Bearer tok_abc') return HttpResponse.json({ value: 1 })
    return HttpResponse.json({ error: 'no auth' }, { status: 401 })
  }),
  http.get(`${BASE}/server-error`, () => HttpResponse.json({ msg: 'boom' }, { status: 500 })),
]

const server = setupServer(...handlers)

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => {
  server.resetHandlers()
  useAuthStore.setState({ token: null, user: null })
})
afterAll(() => server.close())

describe('apiGet', () => {
  it('parses the response against the provided schema', async () => {
    const data = await apiGet('/echo', responseSchema)
    expect(data).toEqual({ value: 42 })
  })

  it('throws if the response does not match the schema', async () => {
    await expect(apiGet('/bad-shape', responseSchema)).rejects.toThrow()
  })

  it('attaches the bearer token from the auth store', async () => {
    useAuthStore.setState({ token: 'tok_abc' })
    await expect(apiGet('/needs-auth', responseSchema)).resolves.toEqual({ value: 1 })
  })

  it('throws ApiError with status on non-2xx responses', async () => {
    let caught: unknown
    try {
      await apiGet('/server-error', responseSchema)
    } catch (err) {
      caught = err
    }
    expect(caught).toBeInstanceOf(ApiError)
    expect((caught as ApiError).status).toBe(500)
  })
})

describe('apiPost', () => {
  beforeEach(() => useAuthStore.setState({ token: null, user: null }))

  it('round-trips a JSON body and validates the response', async () => {
    const data = await apiPost('/echo', { value: 99 }, responseSchema)
    expect(data).toEqual({ value: 99 })
  })
})
