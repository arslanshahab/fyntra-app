import { useQuery } from '@tanstack/react-query'
import { z } from 'zod'

import { apiGet } from '../../services/api/client'
import { classSchema } from '../../types/schemas'

const classListSchema = z.array(classSchema)

export const classKeys = {
  list: ['classes', 'list'] as const,
}

export function useClassesQuery() {
  return useQuery({
    queryKey: classKeys.list,
    queryFn: () => apiGet('/classes', classListSchema),
    staleTime: 5 * 60_000,
  })
}
