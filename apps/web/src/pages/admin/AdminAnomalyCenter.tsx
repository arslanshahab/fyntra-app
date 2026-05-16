import { useState } from 'react'
import { AlertTriangle, ShieldCheck } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'

import { Badge } from '../../components/atoms/Badge'
import { Icon } from '../../components/atoms/Icon'
import { StatusCard } from '../../components/molecules/StatusCard'
import { useAnomalyList } from '../../features/attendance/queries'
import { useStudentsQuery } from '../../features/students/queries'
import type { AttendanceRecord } from '@fyntra/schemas'
import { dateStrInKarachi, formatTimelineDate } from '../../utils/datetime'

function daysAgo(n: number): string {
  return dateStrInKarachi(new Date(Date.now() - n * 86400000))
}

type ChipKey = 'cardAnomaly' | 'leftWithoutScan' | 'flaggedForReview'

function chipsFor(row: AttendanceRecord): ChipKey[] {
  const chips: ChipKey[] = []
  if (row.cardAnomaly) chips.push('cardAnomaly')
  if (row.leftWithoutScan) chips.push('leftWithoutScan')
  if (row.flaggedForReview) chips.push('flaggedForReview')
  return chips
}

export function AdminAnomalyCenter() {
  const { t } = useTranslation()
  const today = dateStrInKarachi()

  const [from, setFrom] = useState(() => daysAgo(7))
  const [to, setTo] = useState(today)

  const anomalies = useAnomalyList(from, to)
  const students = useStudentsQuery()
  const studentsById = new Map((students.data ?? []).map((s) => [s.id, s]))

  return (
    <div className="space-y-5">
      <header className="flex items-baseline justify-between gap-2">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-stone-900">
            {t('admin.anomaly.title')}
          </h1>
          <p className="mt-0.5 text-sm text-stone-500">{t('admin.anomaly.subtitle')}</p>
        </div>
        {anomalies.data ? (
          <span className="font-mono text-sm tabular-nums text-stone-500">
            {anomalies.data.length}
          </span>
        ) : null}
      </header>

      <section className="rounded-2xl bg-white p-5 shadow-elev-1 ring-1 ring-stone-200">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block text-sm font-medium text-stone-700">
            {t('admin.anomaly.fromLabel')}
            <input
              type="date"
              value={from}
              max={to}
              onChange={(e) => setFrom(e.target.value)}
              className="mt-1.5 block h-11 w-full rounded-lg border border-stone-300 bg-white px-3 text-sm text-stone-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
            />
          </label>
          <label className="block text-sm font-medium text-stone-700">
            {t('admin.anomaly.toLabel')}
            <input
              type="date"
              value={to}
              min={from}
              max={today}
              onChange={(e) => setTo(e.target.value)}
              className="mt-1.5 block h-11 w-full rounded-lg border border-stone-300 bg-white px-3 text-sm text-stone-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
            />
          </label>
        </div>
      </section>

      {anomalies.isLoading ? (
        <div
          aria-busy="true"
          aria-label={t('common.loading')}
          className="overflow-hidden rounded-2xl bg-white shadow-elev-1 ring-1 ring-stone-200"
        >
          <ul className="animate-pulse divide-y divide-stone-100">
            {Array.from({ length: 5 }).map((_, i) => (
              <li key={i} className="px-4 py-3">
                <div className="flex items-start gap-3">
                  <div className="mt-1 h-4 w-4 rounded bg-stone-100" />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-3.5 w-40 rounded bg-stone-100" />
                    <div className="h-3 w-24 rounded bg-stone-100" />
                    <div className="flex gap-1.5 pt-0.5">
                      <div className="h-5 w-20 rounded-full bg-stone-100" />
                      <div className="h-5 w-24 rounded-full bg-stone-100" />
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : anomalies.isError ? (
        <StatusCard
          tone="alarm"
          icon={AlertTriangle}
          body={t('admin.anomaly.loadError')}
          action={{ label: t('common.retry'), onClick: () => void anomalies.refetch() }}
        />
      ) : !anomalies.data || anomalies.data.length === 0 ? (
        <StatusCard icon={ShieldCheck} body={t('admin.anomaly.empty')} />
      ) : (
        <div className="overflow-hidden rounded-2xl bg-white shadow-elev-1 ring-1 ring-stone-200">
          <ul className="divide-y divide-stone-100">
            {anomalies.data.map((row) => {
              const student = studentsById.get(row.studentId)
              const chips = chipsFor(row)
              return (
                <li
                  key={row.id}
                  className="flex flex-col gap-2 px-4 py-3 transition-colors hover:bg-stone-50 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex items-start gap-3">
                    <Icon
                      icon={AlertTriangle}
                      size="sm"
                      className="mt-1 flex-shrink-0 text-status-late"
                    />
                    <div className="min-w-0">
                      <p className="truncate font-medium text-stone-900">
                        {student?.fullName ?? t('admin.unknownStudent')}
                      </p>
                      <p className="font-mono text-xs tabular-nums text-stone-500">
                        {formatTimelineDate(row.date)}
                      </p>
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {chips.map((k) => (
                          <Badge key={k} tone="late">
                            {t(`admin.anomaly.reasons.${k}`)}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  </div>
                  <Link
                    to={`/admin/students/${row.studentId}`}
                    className="self-start rounded text-sm font-medium text-brand-700 transition-colors hover:text-brand-800 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 sm:self-center"
                  >
                    {t('admin.anomaly.viewTimeline')}
                  </Link>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}
