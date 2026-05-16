import { describe, it, expect } from 'vitest'
import {
  resolvePagination,
  setNextCursor,
  DEFAULT_PAGE_LIMIT,
  MAX_PAGE_LIMIT,
} from './pagination.js'

interface MockReply {
  headers: Record<string, string>
  header(name: string, value: string): void
}
function mockReply(): MockReply {
  const headers: Record<string, string> = {}
  return {
    headers,
    header(name: string, value: string) {
      headers[name] = value
    },
  }
}

describe('resolvePagination', () => {
  it('defaults limit to DEFAULT_PAGE_LIMIT when missing', () => {
    expect(resolvePagination({})).toEqual({ limit: DEFAULT_PAGE_LIMIT, cursor: undefined })
  })

  it('clamps limit to MAX_PAGE_LIMIT when too large', () => {
    expect(resolvePagination({ limit: 10000 })).toEqual({ limit: MAX_PAGE_LIMIT, cursor: undefined })
  })

  it('floors fractional limit values', () => {
    expect(resolvePagination({ limit: 2.7 }).limit).toBe(2)
  })

  it('clamps zero/negative to minimum of 1', () => {
    expect(resolvePagination({ limit: 0 }).limit).toBe(1)
    expect(resolvePagination({ limit: -5 }).limit).toBe(1)
  })

  it('passes cursor through unchanged', () => {
    expect(resolvePagination({ limit: 10, cursor: 'abc' })).toEqual({ limit: 10, cursor: 'abc' })
  })
})

describe('setNextCursor', () => {
  it('sets header when page is full', () => {
    const reply = mockReply()
    setNextCursor(reply as unknown as Parameters<typeof setNextCursor>[0], [{ id: 'a' }, { id: 'b' }], 2)
    expect(reply.headers['x-next-cursor']).toBe('b')
  })

  it('does not set header when page is short', () => {
    const reply = mockReply()
    setNextCursor(reply as unknown as Parameters<typeof setNextCursor>[0], [{ id: 'a' }], 2)
    expect(reply.headers['x-next-cursor']).toBeUndefined()
  })

  it('does not set header on empty result', () => {
    const reply = mockReply()
    setNextCursor(reply as unknown as Parameters<typeof setNextCursor>[0], [], 2)
    expect(reply.headers['x-next-cursor']).toBeUndefined()
  })
})
