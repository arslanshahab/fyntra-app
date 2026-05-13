import { useTranslation } from 'react-i18next'

import { Spinner } from '../../components/atoms/Spinner'
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
      <div
        role="status"
        aria-label={t('common.loading')}
        className="flex items-center justify-center rounded-2xl bg-white p-12 shadow-sm ring-1 ring-slate-200"
      >
        <Spinner />
      </div>
    )
  }

  if (!klass) {
    return (
      <p className="rounded-2xl bg-white p-6 text-sm text-slate-500 shadow-sm ring-1 ring-slate-200">
        {t('teacher.noClass')}
      </p>
    )
  }

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-xl font-semibold text-slate-900">
          {t('teacher.history.title', { name: klass.name })}
        </h1>
        <p className="mt-0.5 text-sm text-slate-500">{t('teacher.history.subtitle')}</p>
      </header>

      <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
        {range.isLoading ? (
          <div role="status" aria-label={t('common.loading')} className="p-12 text-center">
            <Spinner />
          </div>
        ) : summaries.length === 0 ? (
          <p className="p-8 text-center text-sm text-slate-500">{t('teacher.history.empty')}</p>
        ) : (
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th scope="col" className="px-4 py-3 text-left font-medium">
                  {t('teacher.history.table.date')}
                </th>
                <th scope="col" className="px-4 py-3 text-right font-medium">
                  {t('teacher.history.table.present')}
                </th>
                <th scope="col" className="px-4 py-3 text-right font-medium">
                  {t('teacher.history.table.late')}
                </th>
                <th scope="col" className="px-4 py-3 text-right font-medium">
                  {t('teacher.history.table.absent')}
                </th>
                <th scope="col" className="px-4 py-3 text-right font-medium">
                  {t('teacher.history.table.leftEarly')}
                </th>
                <th scope="col" className="px-4 py-3 text-right font-medium">
                  {t('teacher.history.table.total')}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {summaries.map((d) => (
                <tr key={d.date}>
                  <td className="px-4 py-2.5 text-slate-700">{formatTimelineDate(d.date)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-status-present">
                    {d.present}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-status-late">{d.late}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-status-absent">
                    {d.absent}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-slate-500">
                    {d.leftEarly}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-slate-900">
                    {d.total}
                    {expectedRoster && d.total !== expectedRoster ? (
                      <span className="ml-1 text-xs text-slate-400">/ {expectedRoster}</span>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
