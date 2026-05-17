import { useTranslation } from 'react-i18next'

import type { StudentAttendanceSummary } from '@fyntra/schemas'

interface AttendanceSummaryCardProps {
  summary: StudentAttendanceSummary
  // Variant hint for layout density. `inline` is the compact strip we
  // embed in the parent ChildCard; `panel` is the standalone card used on
  // admin student detail.
  variant?: 'inline' | 'panel'
}

function formatPct(pct: number | null): string {
  if (pct === null) return '—'
  return `${pct.toFixed(0)}%`
}

export function AttendanceSummaryCard({ summary, variant = 'panel' }: AttendanceSummaryCardProps) {
  const { t } = useTranslation()
  const m = summary.month.counts
  const y = summary.year.counts

  if (variant === 'inline') {
    // Compact one-liner for the parent child card.
    return (
      <p className="font-mono text-xs tabular-nums text-stone-500">
        <span className="font-semibold text-stone-700">{t('attendanceSummary.thisMonth')}:</span>{' '}
        <span className="text-status-present">{m.present}</span>
        {'/'}
        <span>{m.workingDays}</span>
        {' '}
        <span aria-hidden="true">·</span>{' '}
        <span className="text-status-late">{m.late}L</span>{' '}
        <span aria-hidden="true">·</span>{' '}
        <span className="font-semibold text-stone-900">{formatPct(m.attendancePct)}</span>
      </p>
    )
  }

  return (
    <section className="rounded-2xl bg-white p-5 shadow-elev-1 ring-1 ring-stone-200">
      <header className="flex items-baseline justify-between">
        <h2 className="text-micro font-semibold uppercase tracking-wide text-stone-500">
          {t('attendanceSummary.title')}
        </h2>
      </header>
      <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <SummaryPanel label={t('attendanceSummary.thisMonth')} counts={m} period={summary.month.period} />
        <SummaryPanel
          label={t('attendanceSummary.yearToDate')}
          counts={y}
          period={`${summary.year.from} → ${summary.year.to}`}
        />
      </div>
    </section>
  )
}

interface SummaryPanelProps {
  label: string
  counts: StudentAttendanceSummary['month']['counts']
  period: string
}

function SummaryPanel({ label, counts, period }: SummaryPanelProps) {
  const { t } = useTranslation()
  return (
    <div className="rounded-xl bg-stone-50 p-4 ring-1 ring-inset ring-stone-100">
      <header className="flex items-baseline justify-between">
        <p className="text-sm font-semibold text-stone-900">{label}</p>
        <p className="font-mono text-xs tabular-nums text-stone-500">{period}</p>
      </header>
      <p className="mt-2 font-mono text-3xl font-semibold tabular-nums text-stone-900">
        {formatPct(counts.attendancePct)}
      </p>
      <dl className="mt-3 grid grid-cols-3 gap-2 text-xs">
        <Stat label={t('attendanceSummary.present')} value={counts.present} tone="present" />
        <Stat label={t('attendanceSummary.late')} value={counts.late} tone="late" />
        <Stat label={t('attendanceSummary.absent')} value={counts.absent} tone="absent" />
        <Stat label={t('attendanceSummary.halfDay')} value={counts.halfDay} tone="late" />
        <Stat label={t('attendanceSummary.excused')} value={counts.excused} tone="notyet" />
        <Stat label={t('attendanceSummary.workingDays')} value={counts.workingDays} tone="neutral" />
      </dl>
    </div>
  )
}

const toneClass = {
  present: 'text-status-present',
  late: 'text-status-late',
  absent: 'text-status-absent',
  notyet: 'text-status-notyet',
  neutral: 'text-stone-700',
} as const

interface StatProps {
  label: string
  value: number
  tone: keyof typeof toneClass
}

function Stat({ label, value, tone }: StatProps) {
  return (
    <div>
      <dt className="text-stone-500">{label}</dt>
      <dd className={`font-mono text-base font-semibold tabular-nums ${toneClass[tone]}`}>{value}</dd>
    </div>
  )
}
