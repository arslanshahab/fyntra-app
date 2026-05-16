import type { FastifyReply } from 'fastify'

export interface PaginationParams {
  limit?: number
  cursor?: string
}

export interface ResolvedPagination {
  limit: number
  cursor: string | undefined
}

export const DEFAULT_PAGE_LIMIT = 100
export const MAX_PAGE_LIMIT = 500

/**
 * Resolve raw query-string pagination params into a clamped { limit, cursor }
 * pair. Limit defaults to DEFAULT_PAGE_LIMIT, is floored, and clamped silently
 * to [1, MAX_PAGE_LIMIT].
 */
export function resolvePagination(p: PaginationParams): ResolvedPagination {
  const raw = p.limit ?? DEFAULT_PAGE_LIMIT
  const floored = Math.floor(raw)
  const limit = Math.min(Math.max(1, floored), MAX_PAGE_LIMIT)
  return { limit, cursor: p.cursor }
}

/**
 * Set the `X-Next-Cursor` response header iff the returned page is full —
 * i.e. another page may exist. When the page is short, the client is at end
 * of list and no header is set.
 *
 * The cursor is the id of the last row in the result. Because every listing
 * endpoint orders by desc(id), that's the smallest id seen — clients pass it
 * back as ?cursor= and the repo appends lt(id, cursor) to keep descending.
 */
export function setNextCursor<T extends { id: string }>(
  reply: FastifyReply,
  rows: T[],
  limit: number,
): void {
  if (rows.length === limit && rows.length > 0) {
    reply.header('x-next-cursor', rows[rows.length - 1]!.id)
  }
}
