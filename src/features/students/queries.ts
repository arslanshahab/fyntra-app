import { useQuery } from '@tanstack/react-query'
import { z } from 'zod'

import { apiGet } from '../../services/api/client'
import { studentSchema } from '../../types/schemas'

const studentListSchema = z.array(studentSchema)

export const studentKeys = {
  list: (filters: { classId?: string; search?: string } = {}) =>
    ['students', 'list', filters] as const,
  detail: (id: string) => ['students', 'detail', id] as const,
}

interface StudentFilters {
  classId?: string
  search?: string
}

export function useStudentsQuery(filters: StudentFilters = {}) {
  const params = new URLSearchParams()
  if (filters.classId) params.set('classId', filters.classId)
  if (filters.search) params.set('search', filters.search)
  const qs = params.toString()
  return useQuery({
    queryKey: studentKeys.list(filters),
    queryFn: () => apiGet(`/students${qs ? `?${qs}` : ''}`, studentListSchema),
    staleTime: 60_000,
  })
}
