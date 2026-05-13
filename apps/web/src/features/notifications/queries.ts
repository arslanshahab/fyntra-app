import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'

import { apiGet, apiPatch, apiPost } from '../../services/api/client'
import {
  notificationLogSchema,
  notificationSettingsSchema,
  type NotificationLog,
  type NotificationSettings,
  type notificationStatusSchema,
} from '../../types/schemas'

const notificationListSchema = z.array(notificationLogSchema)

type NotificationStatus = z.infer<typeof notificationStatusSchema>

export const notificationKeys = {
  list: (filters: { status?: NotificationStatus; userId?: string } = {}) =>
    ['notifications', 'list', filters] as const,
  settings: ['notifications', 'settings'] as const,
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

export function useNotificationSettingsQuery(enabled = true) {
  return useQuery({
    queryKey: notificationKeys.settings,
    queryFn: () => apiGet('/notifications/settings', notificationSettingsSchema),
    enabled,
    staleTime: 60_000,
  })
}

interface SettingsMutationContext {
  previous: NotificationSettings | undefined
}

export function useUpdateNotificationSettingsMutation() {
  const client = useQueryClient()
  return useMutation<NotificationSettings, Error, NotificationSettings, SettingsMutationContext>({
    mutationFn: (next) => apiPatch('/notifications/settings', next, notificationSettingsSchema),
    // Optimistic update so toggles flip instantly, with rollback on error.
    onMutate: async (next) => {
      await client.cancelQueries({ queryKey: notificationKeys.settings })
      const previous = client.getQueryData<NotificationSettings>(notificationKeys.settings)
      client.setQueryData(notificationKeys.settings, next)
      return { previous }
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        client.setQueryData(notificationKeys.settings, context.previous)
      }
    },
    onSettled: () => {
      void client.invalidateQueries({ queryKey: notificationKeys.settings })
    },
  })
}
