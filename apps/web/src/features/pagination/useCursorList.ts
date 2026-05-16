import { useInfiniteQuery, type QueryKey } from '@tanstack/react-query'
import type { ZodTypeAny, z } from 'zod'

import { apiGetWithHeaders } from '../../services/api/client'

interface UseCursorListOptions<S extends ZodTypeAny> {
  queryKey: QueryKey
  // Builds the request URL for a given cursor (undefined on the first page).
  path: (cursor: string | undefined) => string
  // Zod schema for the array response body.
  schema: S
  enabled?: boolean
  staleTime?: number
}

// Thin wrapper around useInfiniteQuery for endpoints that paginate via an
// X-Next-Cursor response header. Consumers flatten with
//   (query.data?.pages ?? []).flatMap(p => p.data)
// and call query.fetchNextPage() to load older entries.
export function useCursorList<S extends ZodTypeAny>(opts: UseCursorListOptions<S>) {
  return useInfiniteQuery({
    queryKey: opts.queryKey,
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) => {
      const { data, headers } = await apiGetWithHeaders(opts.path(pageParam), opts.schema)
      const nextCursor = headers.get('x-next-cursor') ?? undefined
      return { data: data as z.infer<S>, nextCursor }
    },
    getNextPageParam: (last) => last.nextCursor,
    enabled: opts.enabled,
    staleTime: opts.staleTime ?? 30_000,
  })
}
