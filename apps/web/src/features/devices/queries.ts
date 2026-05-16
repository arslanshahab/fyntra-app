import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'

import { apiDelete, apiGet, apiPatch, apiPost } from '../../services/api/client'
import {
  deviceSchema,
  deviceTokenSchema,
  okResponseSchema,
  type Device,
  type DeviceToken,
} from '@fyntra/schemas'

const deviceListSchema = z.array(deviceSchema)
const deviceTokenListSchema = z.array(deviceTokenSchema)
const issueDeviceTokenResponseSchema = z.object({
  token: z.string(),
  deviceToken: deviceTokenSchema,
})
export type IssueDeviceTokenResponse = z.infer<typeof issueDeviceTokenResponseSchema>

export const deviceKeys = {
  list: ['devices', 'list'] as const,
  detail: (id: string) => ['devices', 'detail', id] as const,
  tokens: (deviceId: string) => ['devices', 'tokens', deviceId] as const,
}

export function useDevicesQuery() {
  return useQuery({
    queryKey: deviceKeys.list,
    queryFn: () => apiGet('/devices', deviceListSchema),
    staleTime: 30_000,
  })
}

// Cache-friendly single-device lookup: select from the list cache when
// available so the detail page doesn't refetch on a navigation that already
// has the row in memory.
export function useDeviceQuery(id: string | undefined) {
  return useQuery({
    queryKey: id ? deviceKeys.detail(id) : ['devices', 'detail', 'undefined'],
    queryFn: () => apiGet(`/devices/${id!}`, deviceSchema),
    enabled: Boolean(id),
    staleTime: 30_000,
  })
}

export function useDeviceTokensQuery(deviceId: string | undefined) {
  return useQuery({
    queryKey: deviceId ? deviceKeys.tokens(deviceId) : ['devices', 'tokens', 'undefined'],
    queryFn: () => apiGet(`/devices/${deviceId!}/tokens`, deviceTokenListSchema),
    enabled: Boolean(deviceId),
    staleTime: 15_000,
  })
}

interface CreateDeviceInput {
  label: string
  direction: Device['direction']
}

export function useCreateDevice() {
  const client = useQueryClient()
  return useMutation<Device, Error, CreateDeviceInput>({
    mutationFn: (input) => apiPost('/devices', input, deviceSchema),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: deviceKeys.list })
    },
  })
}

interface PatchDeviceInput {
  label?: string
  direction?: Device['direction']
}

export function usePatchDevice(id: string) {
  const client = useQueryClient()
  return useMutation<Device, Error, PatchDeviceInput>({
    mutationFn: (input) => apiPatch(`/devices/${id}`, input, deviceSchema),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: deviceKeys.list })
      void client.invalidateQueries({ queryKey: deviceKeys.detail(id) })
    },
  })
}

export function useDeleteDevice() {
  const client = useQueryClient()
  return useMutation<{ ok: true }, Error, string>({
    mutationFn: (id) => apiDelete(`/devices/${id}`, okResponseSchema),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: deviceKeys.list })
    },
  })
}

interface IssueDeviceTokenInput {
  label: string
}

export function useIssueDeviceToken(deviceId: string) {
  const client = useQueryClient()
  return useMutation<IssueDeviceTokenResponse, Error, IssueDeviceTokenInput>({
    mutationFn: (input) =>
      apiPost(`/devices/${deviceId}/tokens`, input, issueDeviceTokenResponseSchema),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: deviceKeys.tokens(deviceId) })
    },
  })
}

export function useRevokeDeviceToken(deviceId: string) {
  const client = useQueryClient()
  return useMutation<DeviceToken, Error, string>({
    mutationFn: (tokenId) =>
      apiDelete(`/devices/${deviceId}/tokens/${tokenId}`, deviceTokenSchema),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: deviceKeys.tokens(deviceId) })
    },
  })
}
