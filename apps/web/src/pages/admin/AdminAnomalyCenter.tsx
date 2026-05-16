import { useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'

import { Badge } from '../../components/atoms/Badge'
import { Button } from '../../components/atoms/Button'
import { Icon } from '../../components/atoms/Icon'
import { Spinner } from '../../components/atoms/Spinner'
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
    <div className="space-y-4">
      <header className="flex items-baseline justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">{t('admin.anomaly.title')}</h1>
          <p className="text-sm text-slate-500">{t('admin.anomaly.subtitle')}</p>
        </div>
        {anomalies.data ? (
          <span className="text-sm text-slate-500">{anomalies.data.length}</span>
        ) : null}
      </header>

      <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block text-sm font-medium text-slate-700">
            {t('admin.anomaly.fromLabel')}
            <input
              type="date"
              value={from}
              max={to}
              onChange={(e) => setFrom(e.target.value)}
              className="mt-1 block h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
            />
          </label>
          <label className="block text-sm font-medium text-slate-700">
            {t('admin.anomaly.toLabel')}
            <input
              type="date"
              value={to}
              min={from}
              max={today}
              onChange={(e) => setTo(e.target.value)}
              className="mt-1 block h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
            />
          </label>
        </div>
      </section>

      <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
        {anomalies.isLoading ? (
          <div role="status" aria-label={t('common.loading')} className="p-12 text-center">
            <Spinner />
          </div>
        ) : anomalies.isError ? (
          <div className="space-y-3 p-5">
            <p role="alert" className="text-sm text-status-alarm">
              {t('admin.anomaly.loadError')}
            </p>
            <Button variant="ghost" size="sm" onClick={() => void anomalies.refetch()}>
              {t('common.retry')}
            </Button>
          </div>
        ) : !anomalies.data || anomalies.data.length === 0 ? (
          <p className="p-8 text-center text-sm text-slate-500">{t('admin.anomaly.empty')}</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {anomalies.data.map((row) => {
              const student = studentsById.get(row.studentId)
              const chips = chipsFor(row)
              return (
                <li key={row.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-start gap-3">
                    <Icon icon={AlertTriangle} size="sm" className="mt-1 text-status-late" />
                    <div className="min-w-0">
                      <p className="truncate font-medium text-slate-900">
                        {student?.fullName ?? t('admin.unknownStudent')}
                      </p>
                      <p className="text-xs tabular-nums text-slate-500">
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
                    className="self-start text-sm font-medium text-brand-700 hover:text-brand-800 sm:self-center"
                  >
                    {t('admin.anomaly.viewTimeline')}
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
