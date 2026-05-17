import { useQuery } from '@tanstack/react-query'

import { apiGet } from '../../services/api/client'
import { teacherPickerListSchema, type TeacherPickerEntry } from '@fyntra/schemas'

export const userKeys = {
  teachers: ['users', 'teachers'] as const,
}

export function useTeachersQuery() {
  return useQuery<TeacherPickerEntry[]>({
    queryKey: userKeys.teachers,
    queryFn: () => apiGet('/users?role=teacher', teacherPickerListSchema),
    staleTime: 60_000,
  })
}
