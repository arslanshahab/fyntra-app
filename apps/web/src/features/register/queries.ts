import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'

import { apiGet, apiPost } from '../../services/api/client'
import {
  attendanceRecordSchema,
  classRegisterResponseSchema,
  okResponseSchema,
  todaySummaryResponseSchema,
} from '@fyntra/schemas'

// Lock returns the post-lock attendance state for the class — handy for
// optimistic updates on Teacher Today (we can drop the rows straight into
// the cache).
const lockResultSchema = z.object({
  classId: z.string(),
  date: z.string(),
  lockedAt: z.string(),
  lockedBy: z.string(),
  records: z.array(attendanceRecordSchema),
})

export type LockResult = z.infer<typeof lockResultSchema>

export function useLockRegister(classId: string | undefined) {
  const client = useQueryClient()
  return useMutation<LockResult, Error, { date: string }>({
    mutationFn: (input) =>
      apiPost(`/classes/${classId!}/register/lock`, input, lockResultSchema),
    onSuccess: () => {
      // Lock changes the day's records (both lock metadata and possibly new
      // absent rows). Invalidate broadly so every consumer refetches.
      void client.invalidateQueries({ queryKey: ['attendance'] })
      void client.invalidateQueries({ queryKey: ['tapEvents'] })
    },
  })
}

export function useUnlockRegister(classId: string | undefined) {
  const client = useQueryClient()
  return useMutation<{ ok: true }, Error, { date: string }>({
    mutationFn: (input) =>
      apiPost(`/classes/${classId!}/register/unlock`, input, okResponseSchema),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['attendance'] })
      void client.invalidateQueries({ queryKey: ['tapEvents'] })
    },
  })
}

// --- Monthly register (F5) ---

export const registerKeys = {
  month: (classId: string, month: string) => ['register', 'month', classId, month] as const,
  today: ['register', 'today-summary'] as const,
}

export function useClassRegister(classId: string | undefined, month: string | undefined) {
  return useQuery({
    queryKey: classId && month ? registerKeys.month(classId, month) : ['register', 'month', 'unset'],
    queryFn: () =>
      apiGet(`/classes/${classId!}/register?month=${month!}`, classRegisterResponseSchema),
    enabled: Boolean(classId && month),
    staleTime: 60_000,
  })
}

// --- Today summary (F7) — admin dashboard rollup ---

export function useTodaySummary(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: registerKeys.today,
    queryFn: () => apiGet('/attendance/today-summary', todaySummaryResponseSchema),
    enabled: options?.enabled ?? true,
    staleTime: 30_000,
  })
}
