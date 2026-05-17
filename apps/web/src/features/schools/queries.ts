import { useMutation, useQueryClient } from '@tanstack/react-query'

import { apiPatch } from '../../services/api/client'
import { schoolSchema, type School, type Weekday } from '@fyntra/schemas'

export interface PatchSchoolInput {
  startTime?: string
  endTime?: string
  lateThresholdMinutes?: number
  absentThresholdMinutes?: number
  workingDays?: Weekday[]
  halfDayCutoffTime?: string | null
  academicYearStart?: string | null
  academicYearEnd?: string | null
}

export function usePatchSchool() {
  const client = useQueryClient()
  return useMutation<School, Error, PatchSchoolInput>({
    mutationFn: (input) => apiPatch('/schools/me', input, schoolSchema),
    onSuccess: () => {
      // /me ships the school object; invalidate so the dashboard re-reads
      // late/absent thresholds, working days, etc.
      void client.invalidateQueries({ queryKey: ['auth', 'me'] })
    },
  })
}
