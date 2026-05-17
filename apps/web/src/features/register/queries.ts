import { useMutation, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'

import { apiPost } from '../../services/api/client'
import { attendanceRecordSchema, okResponseSchema } from '@fyntra/schemas'

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
