import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'

import { apiGet, apiPost } from '../../services/api/client'
import {
  notificationLogSchema,
  type NotificationLog,
  type notificationStatusSchema,
} from '../../types/schemas'

const notificationListSchema = z.array(notificationLogSchema)

type NotificationStatus = z.infer<typeof notificationStatusSchema>

export const notificationKeys = {
  list: (filters: { status?: NotificationStatus; userId?: string } = {}) =>
    ['notifications', 'list', filters] as const,
}

export function useNotificationsQuery(
  filters: {
    status?: NotificationStatus
    userId?: string
  } = {},
) {
  const params = new URLSearchParams()
  if (filters.status) params.set('status', filters.status)
  if (filters.userId) params.set('userId', filters.userId)
  const qs = params.toString()
  return useQuery({
    queryKey: notificationKeys.list(filters),
    queryFn: () => apiGet(`/notifications${qs ? `?${qs}` : ''}`, notificationListSchema),
    staleTime: 15_000,
  })
}

export function useRetryNotificationMutation() {
  const client = useQueryClient()
  return useMutation<NotificationLog, Error, { id: string }>({
    mutationFn: ({ id }) => apiPost(`/notifications/${id}/retry`, undefined, notificationLogSchema),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['notifications'] })
    },
  })
}
