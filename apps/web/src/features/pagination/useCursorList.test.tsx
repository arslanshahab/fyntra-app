import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { setupServer } from 'msw/node'
import { http, HttpResponse } from 'msw'
import { z } from 'zod'
import type { ReactNode } from 'react'

import { useCursorList } from './useCursorList'

const itemSchema = z.object({ id: z.string() })
const listSchema = z.array(itemSchema)

const BASE = '*/api'

const page1 = [{ id: 'r3' }, { id: 'r2' }]
const page2 = [{ id: 'r1' }]

const server = setupServer(
  http.get(`${BASE}/items`, ({ request }) => {
    const url = new URL(request.url)
    const cursor = url.searchParams.get('cursor')
    if (!cursor) {
      // First page — more rows available, expose cursor at the last item.
      return HttpResponse.json(page1, { headers: { 'x-next-cursor': 'r2' } })
    }
    if (cursor === 'r2') {
      // Second page is the last — no header set.
      return HttpResponse.json(page2)
    }
    return HttpResponse.json([])
  }),
)

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

function wrapperWithClient() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
}

describe('useCursorList', () => {
  it('loads the first page and exposes hasNextPage=true when X-Next-Cursor is present', async () => {
    const { result } = renderHook(
      () =>
        useCursorList({
          queryKey: ['items'],
          path: (cursor) => `/items${cursor ? `?cursor=${cursor}` : ''}`,
          schema: listSchema,
        }),
      { wrapper: wrapperWithClient() },
    )
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.pages).toHaveLength(1)
    expect(result.current.data?.pages[0]?.data).toEqual(page1)
    expect(result.current.hasNextPage).toBe(true)
  })

  it('fetchNextPage appends the next page and reports end-of-list when no header returns', async () => {
    const { result } = renderHook(
      () =>
        useCursorList({
          queryKey: ['items', 'fetch-next'],
          path: (cursor) => `/items${cursor ? `?cursor=${cursor}` : ''}`,
          schema: listSchema,
        }),
      { wrapper: wrapperWithClient() },
    )
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    await waitFor(() => expect(result.current.hasNextPage).toBe(true))

    await act(async () => {
      await result.current.fetchNextPage()
    })

    await waitFor(() => expect(result.current.data?.pages).toHaveLength(2))
    expect(result.current.data?.pages[1]?.data).toEqual(page2)
    await waitFor(() => expect(result.current.hasNextPage).toBe(false))
  })
})
