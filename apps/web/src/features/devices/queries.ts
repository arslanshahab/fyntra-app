import { useQuery } from '@tanstack/react-query'
import { z } from 'zod'

import { apiGet } from '../../services/api/client'
import { deviceSchema } from '@fyntra/schemas'

const deviceListSchema = z.array(deviceSchema)

export const deviceKeys = {
  list: ['devices', 'list'] as const,
}

export function useDevicesQuery() {
  return useQuery({
    queryKey: deviceKeys.list,
    queryFn: () => apiGet('/devices', deviceListSchema),
    staleTime: 30_000,
  })
}
