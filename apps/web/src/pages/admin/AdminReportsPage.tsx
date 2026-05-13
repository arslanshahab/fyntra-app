import { useState } from 'react'
import { Download } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Badge } from '../../components/atoms/Badge'
import { Button } from '../../components/atoms/Button'
import { Icon } from '../../components/atoms/Icon'
import { Spinner } from '../../components/atoms/Spinner'
import { useClassesQuery } from '../../features/classes/queries'
import { downloadAttendanceCsv, useAttendanceReportQuery } from '../../features/reports/queries'
import { useStudentsQuery } from '../../features/students/queries'
import type { AttendanceRecord } from '@fyntra/schemas'
import { dateStrInKarachi, formatTimeInKarachi, formatTimelineDate } from '../../utils/datetime'

const statusTone: Record<AttendanceRecord['status'], 'present' | 'late' | 'absent' | 'notyet'> = {
  present: 'present',
  late: 'late',
  absent: 'absent',
  left_early: 'late',
  unverified: 'notyet',
}

function daysAgo(n: number): string {
  return dateStrInKarachi(new Date(Date.now() - n * 86400000))
}

export function AdminReportsPage() {
  const { t } = useTranslation()
  const today = dateStrInKarachi()

  const [from, setFrom] = useState(() => daysAgo(7))
  const [to, setTo] = useState(today)
  const [classId, setClassId] = useState<string>('')
  const [downloading, setDownloading] = useState(false)
  const [downloadError, setDownloadError] = useState<string | null>(null)

  const filters = { from, to, classId: classId || undefined }
  const report = useAttendanceReportQuery(filters)
  const classes = useClassesQuery()
  const students = useStudentsQuery()
  const studentsById = new Map((students.data ?? []).map((s) => [s.id, s]))

  const onDownload = async () => {
    setDownloading(true)
    setDownloadError(null)
    try {
      await downloadAttendanceCsv(filters)
    } catch {
      setDownloadError(t('admin.reports.downloadError'))
    } finally {
      setDownloading(false)
    }
  }

  const preview = (report.data ?? []).slice(0, 20)

  return (
    <div className="space-y-4">
      <header className="flex items-baseline justify-between gap-2">
        <h1 className="text-xl font-semibold text-slate-900">{t('admin.reports.title')}</h1>
        {report.data ? (
          <span className="text-sm text-slate-500">
            {t('admin.reports.totalRows', { count: report.data.length })}
          </span>
        ) : null}
      </header>

      <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <label className="block text-sm font-medium text-slate-700">
            {t('admin.reports.from')}
            <input
              type="date"
              value={from}
              max={to}
              onChange={(e) => setFrom(e.target.value)}
              className="mt-1 block h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
            />
          </label>
          <label className="block text-sm font-medium text-slate-700">
            {t('admin.reports.to')}
            <input
              type="date"
              value={to}
              min={from}
              max={today}
              onChange={(e) => setTo(e.target.value)}
              className="mt-1 block h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
            />
          </label>
          <label className="block text-sm font-medium text-slate-700">
            {t('admin.reports.classFilter')}
            <select
              value={classId}
              onChange={(e) => setClassId(e.target.value)}
              className="mt-1 block h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
            >
              <option value="">{t('admin.reports.allClasses')}</option>
              {(classes.data ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="mt-4 flex items-center justify-between">
          {downloadError ? (
            <p role="alert" className="text-sm text-status-alarm">
              {downloadError}
            </p>
          ) : (
            <span />
          )}
          <Button
            onClick={() => void onDownload()}
            isLoading={downloading}
            disabled={downloading || !report.data || report.data.length === 0}
            leftIcon={<Icon icon={Download} size="sm" />}
          >
            {t('admin.reports.download')}
          </Button>
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
        <h2 className="border-b border-slate-200 px-5 py-3 text-sm font-semibold text-slate-900">
          {t('admin.reports.preview')}
        </h2>
        {report.isLoading ? (
          <div role="status" aria-label={t('common.loading')} className="p-8 text-center">
            <Spinner />
          </div>
        ) : !report.data || report.data.length === 0 ? (
          <p className="p-8 text-center text-sm text-slate-500">{t('admin.reports.empty')}</p>
        ) : (
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th scope="col" className="px-4 py-3 text-left font-medium">
                  {t('admin.reports.table.date')}
                </th>
                <th scope="col" className="px-4 py-3 text-left font-medium">
                  {t('admin.reports.table.student')}
                </th>
                <th scope="col" className="px-4 py-3 text-left font-medium">
                  {t('admin.reports.table.status')}
                </th>
                <th scope="col" className="px-4 py-3 text-left font-medium">
                  {t('admin.reports.table.firstIn')}
                </th>
                <th scope="col" className="px-4 py-3 text-left font-medium">
                  {t('admin.reports.table.lastOut')}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {preview.map((row) => (
                <tr key={row.id}>
                  <td className="px-4 py-2.5 text-slate-700">{formatTimelineDate(row.date)}</td>
                  <td className="px-4 py-2.5 text-slate-700">
                    {studentsById.get(row.studentId)?.fullName ?? row.studentId}
                  </td>
                  <td className="px-4 py-2.5">
                    <Badge tone={statusTone[row.status]}>
                      {t(`timeline.statusLabel.${row.status}`)}
                    </Badge>
                  </td>
                  <td className="px-4 py-2.5 text-slate-700 tabular-nums">
                    {row.firstInAt ? formatTimeInKarachi(row.firstInAt) : '—'}
                  </td>
                  <td className="px-4 py-2.5 text-slate-700 tabular-nums">
                    {row.lastOutAt ? formatTimeInKarachi(row.lastOutAt) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {report.data && report.data.length > preview.length ? (
          <p className="border-t border-slate-100 px-5 py-3 text-xs text-slate-500">
            {t('admin.reports.previewLimit', {
              shown: preview.length,
              total: report.data.length,
            })}
          </p>
        ) : null}
      </section>
    </div>
  )
}
