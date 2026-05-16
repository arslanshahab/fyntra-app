import { type ReactNode } from 'react'

import { cn } from '../../utils/cn'

type StatTone = 'neutral' | 'present' | 'late' | 'absent' | 'notyet'

interface StatBlockProps {
  label: string
  value: number | string
  tone?: StatTone
  hint?: ReactNode
}

const toneText: Record<StatTone, string> = {
  neutral: 'text-stone-900',
  present: 'text-status-present',
  late: 'text-status-late',
  absent: 'text-status-absent',
  notyet: 'text-status-notyet',
}

const toneStripe: Record<StatTone, string> = {
  neutral: 'bg-stone-200',
  present: 'bg-status-present',
  late: 'bg-status-late',
  absent: 'bg-status-absent',
  notyet: 'bg-status-notyet',
}

export function StatBlock({ label, value, tone = 'neutral', hint }: StatBlockProps) {
  return (
    <div className="overflow-hidden rounded-2xl bg-white shadow-elev-1 ring-1 ring-stone-200">
      <div className={cn('h-1 w-full', toneStripe[tone])} aria-hidden="true" />
      <div className="p-5">
        <p className="text-micro font-medium uppercase text-stone-500">{label}</p>
        <p
          className={cn(
            'mt-2 font-display text-display-lg font-semibold tabular-nums leading-none',
            toneText[tone],
          )}
        >
          {value}
        </p>
        {hint ? <p className="mt-2 text-xs text-stone-500">{hint}</p> : null}
      </div>
    </div>
  )
}

export function StatBlockSkeleton() {
  return (
    <div
      aria-hidden="true"
      className="overflow-hidden rounded-2xl bg-white shadow-elev-1 ring-1 ring-stone-200"
    >
      <div className="h-1 w-full bg-stone-100" />
      <div className="animate-pulse p-5">
        <div className="h-3 w-20 rounded bg-stone-100" />
        <div className="mt-3 h-9 w-16 rounded bg-stone-100" />
        <div className="mt-2.5 h-3 w-24 rounded bg-stone-100" />
      </div>
    </div>
  )
}
