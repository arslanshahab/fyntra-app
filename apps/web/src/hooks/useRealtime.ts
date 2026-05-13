import { useEffect, useState } from 'react'

import type { School } from '../types/schemas'
import { isInSchoolPollingWindow } from '../utils/datetime'
import { usePageVisibility } from './usePageVisibility'

// The single home for the README §6 polling lifecycle:
//   - Active only inside [school.startTime − 30, school.endTime + 30] (PKT)
//   - Pauses when the tab is hidden
//   - Returns a refetchInterval that React Query consumers can pass straight
//     through. Swapping this to a WebSocket in Phase 2 changes only this hook,
//     not its consumers.
export function useRealtime(school: School | undefined): { refetchInterval: number | false } {
  const visible = usePageVisibility()
  // A 60s heartbeat so the school-window check is reactive across boundary
  // transitions (e.g. parent leaves the app open from 07:00 → 07:15).
  const [, force] = useState(0)
  useEffect(() => {
    const id = setInterval(() => force((t) => t + 1), 60_000)
    return () => clearInterval(id)
  }, [])

  if (!school || !visible) return { refetchInterval: false }
  return {
    refetchInterval: isInSchoolPollingWindow(new Date(), school) ? 15_000 : false,
  }
}
