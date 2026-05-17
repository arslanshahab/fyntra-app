import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'

import { apiDelete, apiGet, apiPatch, apiPost } from '../../services/api/client'
import {
  holidaySchema,
  okResponseSchema,
  type Holiday,
  type HolidayKind,
} from '@fyntra/schemas'

const holidayListSchema = z.array(holidaySchema)

export const holidayKeys = {
  // Year-scoped — admins navigate by school year, so the cache key carries
  // it and the sidebar invalidation is precise.
  year: (year: number) => ['holidays', 'year', year] as const,
  all: ['holidays'] as const,
}

function yearRange(year: number): { from: string; to: string } {
  return { from: `${year}-01-01`, to: `${year}-12-31` }
}

export function useHolidaysByYear(year: number) {
  return useQuery({
    queryKey: holidayKeys.year(year),
    queryFn: () => {
      const { from, to } = yearRange(year)
      return apiGet(`/holidays?from=${from}&to=${to}`, holidayListSchema)
    },
    staleTime: 60_000,
  })
}

export interface CreateHolidayInput {
  date: string
  label: string
  kind: HolidayKind
  effectiveEndTime?: string
}

export function useCreateHoliday() {
  const client = useQueryClient()
  return useMutation<Holiday, Error, CreateHolidayInput>({
    mutationFn: (input) => apiPost('/holidays', input, holidaySchema),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: holidayKeys.all })
    },
  })
}

export interface PatchHolidayInput {
  date?: string
  label?: string
  kind?: HolidayKind
  effectiveEndTime?: string
}

export function usePatchHoliday() {
  const client = useQueryClient()
  return useMutation<Holiday, Error, { id: string; patch: PatchHolidayInput }>({
    mutationFn: ({ id, patch }) => apiPatch(`/holidays/${id}`, patch, holidaySchema),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: holidayKeys.all })
    },
  })
}

export function useDeleteHoliday() {
  const client = useQueryClient()
  return useMutation<{ ok: true }, Error, string>({
    mutationFn: (id) => apiDelete(`/holidays/${id}`, okResponseSchema),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: holidayKeys.all })
    },
  })
}
