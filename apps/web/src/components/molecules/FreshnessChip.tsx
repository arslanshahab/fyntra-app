import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { cn } from '../../utils/cn'

type FreshnessTone = 'fresh' | 'stale' | 'cold'

interface FreshnessChipProps {
  // Epoch ms from TanStack Query's `dataUpdatedAt`, or null/undefined when
  // data hasn't arrived yet (the chip hides in that case).
  updatedAt: number | null | undefined
  className?: string
}

const TICK_MS = 5_000
const FRESH_THRESHOLD_MS = 30_000
const STALE_THRESHOLD_MS = 2 * 60_000

const toneClasses: Record<FreshnessTone, { dot: string; pulse: boolean; text: string }> = {
  fresh: { dot: 'bg-brand-600', pulse: true, text: 'text-stone-500' },
  stale: { dot: 'bg-status-late', pulse: false, text: 'text-status-late' },
  cold: { dot: 'bg-status-absent', pulse: false, text: 'text-status-absent' },
}

function toneFor(ageMs: number): FreshnessTone {
  if (ageMs < FRESH_THRESHOLD_MS) return 'fresh'
  if (ageMs < STALE_THRESHOLD_MS) return 'stale'
  return 'cold'
}

function useNowTick() {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), TICK_MS)
    return () => window.clearInterval(id)
  }, [])
  return now
}

export function FreshnessChip({ updatedAt, className }: FreshnessChipProps) {
  const { t } = useTranslation()
  const now = useNowTick()

  if (!updatedAt) return null

  const ageMs = Math.max(0, now - updatedAt)
  const tone = toneFor(ageMs)
  const variant = toneClasses[tone]

  let label: string
  if (ageMs < 5_000) {
    label = t('common.freshness.justNow')
  } else if (ageMs < 60_000) {
    label = t('common.freshness.secondsAgo', { count: Math.floor(ageMs / 1000) })
  } else if (ageMs < 3_600_000) {
    label = t('common.freshness.minutesAgo', { count: Math.floor(ageMs / 60_000) })
  } else {
    label = t('common.freshness.hoursAgo', { count: Math.floor(ageMs / 3_600_000) })
  }

  return (
    <span
      role="status"
      aria-live="off"
      className={cn('inline-flex items-center gap-1.5 text-xs', variant.text, className)}
    >
      <span
        aria-hidden="true"
        className={cn(
          'h-1.5 w-1.5 flex-shrink-0 rounded-full',
          variant.dot,
          variant.pulse && 'motion-safe:animate-fresh-pulse',
        )}
      />
      <span className="tabular-nums">{label}</span>
    </span>
  )
}
