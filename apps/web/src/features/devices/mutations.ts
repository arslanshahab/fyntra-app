import { useMutation, useQueryClient } from '@tanstack/react-query'

import { apiPost } from '../../services/api/client'
import { tapEventSchema, type TapEvent } from '@fyntra/schemas'
import type { TapDirection } from '@fyntra/schemas'

interface SimulateTapInput {
  rfidUid: string
  deviceId: string
  direction: TapDirection
}

export function useSimulateTapMutation() {
  const client = useQueryClient()
  return useMutation<TapEvent, Error, SimulateTapInput>({
    mutationFn: (input) => apiPost('/dev/simulate-tap', input, tapEventSchema),
    onSuccess: () => {
      // A simulated tap touches the live feed and today's attendance.
      void client.invalidateQueries({ queryKey: ['tapEvents'] })
      void client.invalidateQueries({ queryKey: ['attendance'] })
    },
  })
}
