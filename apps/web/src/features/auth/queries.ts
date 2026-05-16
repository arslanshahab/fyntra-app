import { useQuery } from '@tanstack/react-query'

import { apiGet } from '../../services/api/client'
import { useAuthStore } from '../../stores/auth'
import { meResponseSchema } from '@fyntra/schemas'

export const authQueryKeys = {
  me: ['auth', 'me'] as const,
}

export function useMeQuery() {
  const token = useAuthStore((s) => s.token)
  return useQuery({
    queryKey: authQueryKeys.me,
    queryFn: () => apiGet('/me', meResponseSchema),
    // Don't even attempt to fetch without credentials — the handler would
    // 401 and React Query would back off.
    enabled: !!token,
    staleTime: 60_000,
  })
}
