import { type ReactNode } from 'react'

import { cn } from '../../utils/cn'

type StatTone = 'neutral' | 'present' | 'late' | 'absent' | 'notyet'

interface StatBlockProps {
  label: string
  value: number | string
  tone?: StatTone
  hint?: ReactNode
}

const toneClasses: Record<StatTone, string> = {
  neutral: 'text-slate-900',
  present: 'text-status-present',
  late: 'text-status-late',
  absent: 'text-status-absent',
  notyet: 'text-status-notyet',
}

export function StatBlock({ label, value, tone = 'neutral', hint }: StatBlockProps) {
  return (
    <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className={cn('mt-2 text-3xl font-semibold tabular-nums leading-none', toneClasses[tone])}>
        {value}
      </p>
      {hint ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}
    </div>
  )
}
