import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'

import { apiDelete, apiGet, apiPatch, apiPost } from '../../services/api/client'
import {
  classSchema,
  okResponseSchema,
  type Class,
} from '@fyntra/schemas'

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

export interface CreateClassInput {
  name: string
  teacherId: string
}

export function useCreateClass() {
  const client = useQueryClient()
  return useMutation<Class, Error, CreateClassInput>({
    mutationFn: (input) => apiPost('/classes', input, classSchema),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: classKeys.list })
      // The teacher picker depends on the classes list to know who's
      // already assigned, so invalidate it too.
      void client.invalidateQueries({ queryKey: ['users', 'teachers'] })
    },
  })
}

export interface PatchClassInput {
  name?: string
  teacherId?: string
}

export function usePatchClass() {
  const client = useQueryClient()
  return useMutation<Class, Error, { id: string; patch: PatchClassInput }>({
    mutationFn: ({ id, patch }) => apiPatch(`/classes/${id}`, patch, classSchema),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: classKeys.list })
      void client.invalidateQueries({ queryKey: ['users', 'teachers'] })
    },
  })
}

export function useDeleteClass() {
  const client = useQueryClient()
  return useMutation<{ ok: true }, Error, string>({
    mutationFn: (id) => apiDelete(`/classes/${id}`, okResponseSchema),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: classKeys.list })
      void client.invalidateQueries({ queryKey: ['users', 'teachers'] })
    },
  })
}
