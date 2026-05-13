import { ChevronLeft } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams } from 'react-router-dom'

import { Avatar } from '../../components/atoms/Avatar'
import { Badge } from '../../components/atoms/Badge'
import { Icon } from '../../components/atoms/Icon'
import { Spinner } from '../../components/atoms/Spinner'
import { useStudentTimeline } from '../../features/attendance/queries'
import { useClassesQuery } from '../../features/classes/queries'
import { useStudentDetailQuery } from '../../features/students/queries'
import type { AttendanceRecord } from '@fyntra/schemas'
import { formatTimeInKarachi, formatTimelineDate } from '../../utils/datetime'

const statusTone: Record<AttendanceRecord['status'], 'present' | 'late' | 'absent' | 'notyet'> = {
  present: 'present',
  late: 'late',
  absent: 'absent',
  left_early: 'late',
  unverified: 'notyet',
}

export function AdminStudentDetailPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { id } = useParams<{ id: string }>()
  const student = useStudentDetailQuery(id)
  const classes = useClassesQuery()
  const timeline = useStudentTimeline(id)

  const className = student.data
    ? (classes.data?.find((c) => c.id === student.data!.classId)?.name ?? student.data.classId)
    : ''

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={() => navigate('/admin/students')}
        className="inline-flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900 focus:outline-none focus-visible:underline"
      >
        <Icon icon={ChevronLeft} size="sm" className="rtl:rotate-180" />
        {t('admin.studentDetail.back')}
      </button>

      {student.isLoading ? (
        <div
          role="status"
          aria-label={t('common.loading')}
          className="flex items-center justify-center rounded-2xl bg-white p-12 shadow-sm ring-1 ring-slate-200"
        >
          <Spinner />
        </div>
      ) : student.isError || !student.data ? (
        <p role="alert" className="rounded-2xl bg-status-alarm/10 p-5 text-sm text-status-alarm">
          {t('admin.studentDetail.loadError')}
        </p>
      ) : (
        <>
          <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
            <div className="flex items-center gap-4">
              <Avatar name={student.data.fullName} src={student.data.photoUrl} size="lg" />
              <div className="min-w-0">
                <h1 className="truncate text-xl font-semibold text-slate-900">
                  {student.data.fullName}
                </h1>
                <p className="text-sm text-slate-500">
                  {student.data.rollNumber} · {className}
                </p>
                <div className="mt-2">
                  {student.data.cardId ? (
                    <Badge tone="present">{t('admin.cards.status.active')}</Badge>
                  ) : (
                    <Badge tone="notyet">{t('admin.studentDetail.noCard')}</Badge>
                  )}
                </div>
              </div>
            </div>
          </section>

          <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
            <h2 className="text-sm font-semibold text-slate-900">
              {t('admin.studentDetail.guardians')}
            </h2>
            {student.data.guardians.length === 0 ? (
              <p className="mt-3 text-sm text-slate-500">{t('admin.studentDetail.noGuardians')}</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {student.data.guardians.map((g) => (
                  <li
                    key={g.id}
                    className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2"
                  >
                    <span className="text-sm font-medium text-slate-900">{g.fullName}</span>
                    <span className="text-xs tabular-nums text-slate-500">{g.phone}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
            <h2 className="text-sm font-semibold text-slate-900">
              {t('admin.studentDetail.recentAttendance')}
            </h2>
            {timeline.isLoading ? (
              <div role="status" aria-label={t('common.loading')} className="py-4 text-center">
                <Spinner size="sm" />
              </div>
            ) : !timeline.data || timeline.data.length === 0 ? (
              <p className="mt-3 text-sm text-slate-500">{t('timeline.empty')}</p>
            ) : (
              <ul className="mt-3 divide-y divide-slate-100">
                {timeline.data.slice(0, 14).map((record) => (
                  <li
                    key={record.id}
                    className="flex items-center justify-between py-2.5 first:pt-0 last:pb-0"
                  >
                    <div>
                      <p className="text-sm font-medium text-slate-900">
                        {formatTimelineDate(record.date)}
                      </p>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {record.firstInAt ? formatTimeInKarachi(record.firstInAt) : '—'}
                        {' / '}
                        {record.lastOutAt ? formatTimeInKarachi(record.lastOutAt) : '—'}
                      </p>
                    </div>
                    <Badge tone={statusTone[record.status]}>
                      {t(`timeline.statusLabel.${record.status}`)}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  )
}
