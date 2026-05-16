import { CalendarX, UserX } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { StatusCard } from '../../components/molecules/StatusCard'
import { useClassAttendanceRange } from '../../features/attendance/queries'
import { useMeQuery } from '../../features/auth/queries'
import { useStudentsQuery } from '../../features/students/queries'
import type { AttendanceRecord } from '@fyntra/schemas'
import { formatTimelineDate } from '../../utils/datetime'

interface DailySummary {
  date: string
  present: number
  late: number
  absent: number
  leftEarly: number
  total: number
}

function summarize(records: AttendanceRecord[]): DailySummary[] {
  const byDate = new Map<string, DailySummary>()
  for (const r of records) {
    let entry = byDate.get(r.date)
    if (!entry) {
      entry = { date: r.date, present: 0, late: 0, absent: 0, leftEarly: 0, total: 0 }
      byDate.set(r.date, entry)
    }
    entry.total += 1
    switch (r.status) {
      case 'present':
        entry.present += 1
        break
      case 'late':
        entry.late += 1
        break
      case 'absent':
        entry.absent += 1
        break
      case 'left_early':
        entry.leftEarly += 1
        break
    }
  }
  return [...byDate.values()].sort((a, b) => (a.date < b.date ? 1 : -1))
}

function HistoryRowSkeleton() {
  return (
    <tr aria-hidden="true" className="animate-pulse">
      <td className="px-4 py-2.5">
        <div className="h-3.5 w-28 rounded bg-stone-100" />
      </td>
      {Array.from({ length: 5 }).map((_, i) => (
        <td key={i} className="px-4 py-2.5">
          <div className="ml-auto h-3.5 w-8 rounded bg-stone-100" />
        </td>
      ))}
    </tr>
  )
}

export function TeacherHistoryPage() {
  const { t } = useTranslation()
  const me = useMeQuery()
  const klass = me.data?.assignedClass
  const students = useStudentsQuery({ classId: klass?.id })
  const range = useClassAttendanceRange(klass?.id)

  const summaries = range.data ? summarize(range.data) : []
  const expectedRoster = students.data?.length ?? 0

  if (me.isLoading) {
    return (
      <div aria-busy="true" aria-label={t('common.loading')} className="space-y-5">
        <div className="animate-pulse">
          <div className="h-7 w-64 rounded bg-stone-100" />
          <div className="mt-1.5 h-3.5 w-72 rounded bg-stone-100" />
        </div>
        <div className="overflow-hidden rounded-2xl bg-white shadow-elev-1 ring-1 ring-stone-200">
          <div className="h-12 animate-pulse border-b border-stone-200 bg-stone-50" />
          <ul className="animate-pulse divide-y divide-stone-100">
            {Array.from({ length: 6 }).map((_, i) => (
              <li key={i} className="grid grid-cols-6 items-center gap-2 px-4 py-2.5">
                <div className="h-3.5 w-20 rounded bg-stone-100" />
                {Array.from({ length: 5 }).map((_, j) => (
                  <div key={j} className="ml-auto h-3.5 w-8 rounded bg-stone-100" />
                ))}
              </li>
            ))}
          </ul>
        </div>
      </div>
    )
  }

  if (!klass) {
    return <StatusCard icon={UserX} body={t('teacher.noClass')} />
  }

  return (
    <div className="space-y-5">
      <header>
        <h1 className="font-display text-2xl font-semibold tracking-tight text-stone-900">
          {t('teacher.history.title', { name: klass.name })}
        </h1>
        <p className="mt-0.5 text-sm text-stone-500">{t('teacher.history.subtitle')}</p>
      </header>

      {!range.isLoading && summaries.length === 0 ? (
        <StatusCard icon={CalendarX} body={t('teacher.history.empty')} />
      ) : (
        <div className="overflow-hidden rounded-2xl bg-white shadow-elev-1 ring-1 ring-stone-200">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-stone-200 text-sm">
              <thead className="bg-stone-50 text-micro uppercase text-stone-500">
                <tr>
                  <th scope="col" className="px-4 py-3 text-left font-semibold">
                    {t('teacher.history.table.date')}
                  </th>
                  <th scope="col" className="px-4 py-3 text-right font-semibold">
                    {t('teacher.history.table.present')}
                  </th>
                  <th scope="col" className="px-4 py-3 text-right font-semibold">
                    {t('teacher.history.table.late')}
                  </th>
                  <th scope="col" className="px-4 py-3 text-right font-semibold">
                    {t('teacher.history.table.absent')}
                  </th>
                  <th scope="col" className="px-4 py-3 text-right font-semibold">
                    {t('teacher.history.table.leftEarly')}
                  </th>
                  <th scope="col" className="px-4 py-3 text-right font-semibold">
                    {t('teacher.history.table.total')}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {range.isLoading
                  ? Array.from({ length: 6 }).map((_, i) => <HistoryRowSkeleton key={i} />)
                  : summaries.map((d) => (
                      <tr key={d.date} className="transition-colors hover:bg-stone-50">
                        <td className="px-4 py-2.5 text-stone-700">{formatTimelineDate(d.date)}</td>
                        <td className="px-4 py-2.5 text-right font-mono tabular-nums text-status-present">
                          {d.present}
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono tabular-nums text-status-late">
                          {d.late}
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono tabular-nums text-status-absent">
                          {d.absent}
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono tabular-nums text-stone-500">
                          {d.leftEarly}
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono tabular-nums text-stone-900">
                          {d.total}
                          {expectedRoster && d.total !== expectedRoster ? (
                            <span className="ml-1 text-xs text-stone-400">/ {expectedRoster}</span>
                          ) : null}
                        </td>
                      </tr>
                    ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
