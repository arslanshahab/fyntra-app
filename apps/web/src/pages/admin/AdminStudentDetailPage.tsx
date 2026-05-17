import { AlertTriangle, ChevronLeft } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams } from 'react-router-dom'

import { Avatar } from '../../components/atoms/Avatar'
import { Badge } from '../../components/atoms/Badge'
import { Icon } from '../../components/atoms/Icon'
import { StatusCard } from '../../components/molecules/StatusCard'
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
  half_day: 'late',
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
    <div className="space-y-5">
      <button
        type="button"
        onClick={() => navigate('/admin/students')}
        className="inline-flex items-center gap-1 rounded-md text-sm text-stone-600 transition-colors hover:text-stone-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
      >
        <Icon icon={ChevronLeft} size="sm" className="rtl:rotate-180" />
        {t('admin.studentDetail.back')}
      </button>

      {student.isLoading ? (
        <div aria-busy="true" aria-label={t('common.loading')} className="space-y-5">
          <section className="animate-pulse rounded-2xl bg-white p-5 shadow-elev-1 ring-1 ring-stone-200">
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-full bg-stone-100" />
              <div className="space-y-2">
                <div className="h-5 w-44 rounded bg-stone-100" />
                <div className="h-3 w-32 rounded bg-stone-100" />
                <div className="h-5 w-16 rounded-full bg-stone-100" />
              </div>
            </div>
          </section>
          <section className="animate-pulse rounded-2xl bg-white p-5 shadow-elev-1 ring-1 ring-stone-200">
            <div className="h-4 w-28 rounded bg-stone-100" />
            <div className="mt-3 space-y-2">
              <div className="h-9 w-full rounded-lg bg-stone-100" />
              <div className="h-9 w-full rounded-lg bg-stone-100" />
            </div>
          </section>
          <section className="animate-pulse rounded-2xl bg-white p-5 shadow-elev-1 ring-1 ring-stone-200">
            <div className="h-4 w-40 rounded bg-stone-100" />
            <div className="mt-3 space-y-2.5">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex items-center justify-between">
                  <div className="space-y-1">
                    <div className="h-3.5 w-28 rounded bg-stone-100" />
                    <div className="h-3 w-20 rounded bg-stone-100" />
                  </div>
                  <div className="h-5 w-16 rounded-full bg-stone-100" />
                </div>
              ))}
            </div>
          </section>
        </div>
      ) : student.isError || !student.data ? (
        <StatusCard
          tone="alarm"
          icon={AlertTriangle}
          body={t('admin.studentDetail.loadError')}
          action={{ label: t('common.retry'), onClick: () => void student.refetch() }}
        />
      ) : (
        <>
          <section className="rounded-2xl bg-white p-5 shadow-elev-1 ring-1 ring-stone-200">
            <div className="flex items-center gap-4">
              <Avatar name={student.data.fullName} src={student.data.photoUrl} size="lg" />
              <div className="min-w-0">
                <h1 className="truncate font-display text-2xl font-semibold tracking-tight text-stone-900">
                  {student.data.fullName}
                </h1>
                <p className="text-sm text-stone-500">
                  <span className="font-mono">{student.data.rollNumber}</span> · {className}
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

          <section className="rounded-2xl bg-white p-5 shadow-elev-1 ring-1 ring-stone-200">
            <h2 className="font-display text-base font-semibold tracking-tight text-stone-900">
              {t('admin.studentDetail.guardians')}
            </h2>
            {student.data.guardians.length === 0 ? (
              <p className="mt-3 text-sm text-stone-500">{t('admin.studentDetail.noGuardians')}</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {student.data.guardians.map((g) => (
                  <li
                    key={g.id}
                    className="flex items-center justify-between rounded-lg bg-stone-50 px-3 py-2 ring-1 ring-inset ring-stone-200"
                  >
                    <span className="text-sm font-medium text-stone-900">{g.fullName}</span>
                    <span className="font-mono text-xs tabular-nums text-stone-500">
                      {g.phone}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="rounded-2xl bg-white p-5 shadow-elev-1 ring-1 ring-stone-200">
            <h2 className="font-display text-base font-semibold tracking-tight text-stone-900">
              {t('admin.studentDetail.recentAttendance')}
            </h2>
            {timeline.isLoading ? (
              <ul
                aria-busy="true"
                aria-label={t('common.loading')}
                className="mt-3 animate-pulse divide-y divide-stone-100"
              >
                {Array.from({ length: 4 }).map((_, i) => (
                  <li
                    key={i}
                    className="flex items-center justify-between py-2.5 first:pt-0 last:pb-0"
                  >
                    <div className="space-y-1">
                      <div className="h-3.5 w-28 rounded bg-stone-100" />
                      <div className="h-3 w-20 rounded bg-stone-100" />
                    </div>
                    <div className="h-5 w-16 rounded-full bg-stone-100" />
                  </li>
                ))}
              </ul>
            ) : !timeline.data || timeline.data.length === 0 ? (
              <p className="mt-3 text-sm text-stone-500">{t('timeline.empty')}</p>
            ) : (
              <ul className="mt-3 divide-y divide-stone-100">
                {timeline.data.slice(0, 14).map((record) => (
                  <li
                    key={record.id}
                    className="flex items-center justify-between py-2.5 first:pt-0 last:pb-0"
                  >
                    <div>
                      <p className="text-sm font-medium text-stone-900">
                        {formatTimelineDate(record.date)}
                      </p>
                      <p className="mt-0.5 font-mono text-xs tabular-nums text-stone-500">
                        {record.firstInAt ? formatTimeInKarachi(record.firstInAt) : '—'}
                        {' · '}
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
