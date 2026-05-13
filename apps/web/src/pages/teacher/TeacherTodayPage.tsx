import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Avatar } from '../../components/atoms/Avatar'
import { Badge } from '../../components/atoms/Badge'
import { Button } from '../../components/atoms/Button'
import { Spinner } from '../../components/atoms/Spinner'
import { useClassAttendanceToday, useManualTapMutation } from '../../features/attendance/queries'
import { useMeQuery } from '../../features/auth/queries'
import { useStudentsQuery } from '../../features/students/queries'
import type { AttendanceRecord, Student, TapDirection } from '@fyntra/schemas'
import { formatTimeInKarachi } from '../../utils/datetime'

const statusTone: Record<AttendanceRecord['status'], 'present' | 'late' | 'absent' | 'notyet'> = {
  present: 'present',
  late: 'late',
  absent: 'absent',
  left_early: 'late',
}

interface OverrideState {
  student: Student
  direction: TapDirection
  reason: string
}

export function TeacherTodayPage() {
  const { t } = useTranslation()
  const me = useMeQuery()
  const klass = me.data?.assignedClass
  const students = useStudentsQuery({ classId: klass?.id })
  const attendance = useClassAttendanceToday(klass?.id, me.data?.school)
  const manualTap = useManualTapMutation()

  const [override, setOverride] = useState<OverrideState | null>(null)
  const [banner, setBanner] = useState<{ kind: 'success' | 'error'; text: string } | null>(null)

  const attendanceByStudent = new Map((attendance.data ?? []).map((a) => [a.studentId, a]))
  const sortedRoster = [...(students.data ?? [])].sort((a, b) =>
    a.rollNumber.localeCompare(b.rollNumber),
  )

  const submitOverride = () => {
    if (!override || !override.reason.trim()) return
    setBanner(null)
    manualTap.mutate(
      {
        studentId: override.student.id,
        direction: override.direction,
        occurredAt: new Date().toISOString(),
        reason: override.reason.trim(),
      },
      {
        onSuccess: () => {
          setBanner({
            kind: 'success',
            text: t('teacher.today.overrideSuccess', { name: override.student.fullName }),
          })
          setOverride(null)
        },
        onError: () => setBanner({ kind: 'error', text: t('teacher.today.overrideError') }),
      },
    )
  }

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
      <header className="flex items-baseline justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">{klass.name}</h1>
          <p className="mt-0.5 text-sm text-slate-500">{t('teacher.today.subtitle')}</p>
        </div>
        {students.data ? (
          <span className="text-sm text-slate-500">
            {t('teacher.today.studentCount', { count: students.data.length })}
          </span>
        ) : null}
      </header>

      {banner ? (
        <div
          role={banner.kind === 'error' ? 'alert' : 'status'}
          className={
            banner.kind === 'success'
              ? 'rounded-lg bg-status-present/10 px-3 py-2 text-sm text-status-present'
              : 'rounded-lg bg-status-alarm/10 px-3 py-2 text-sm text-status-alarm'
          }
        >
          {banner.text}
        </div>
      ) : null}

      <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
        {students.isLoading || attendance.isLoading ? (
          <div role="status" aria-label={t('common.loading')} className="p-12 text-center">
            <Spinner />
          </div>
        ) : sortedRoster.length === 0 ? (
          <p className="p-8 text-center text-sm text-slate-500">{t('teacher.today.empty')}</p>
        ) : (
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th scope="col" className="px-4 py-3 text-left font-medium">
                  {t('teacher.today.table.name')}
                </th>
                <th scope="col" className="px-4 py-3 text-left font-medium">
                  {t('teacher.today.table.status')}
                </th>
                <th scope="col" className="px-4 py-3 text-left font-medium">
                  {t('teacher.today.table.firstIn')}
                </th>
                <th scope="col" className="px-4 py-3 text-left font-medium">
                  {t('teacher.today.table.lastOut')}
                </th>
                <th scope="col" className="px-4 py-3 text-right font-medium">
                  {t('teacher.today.table.actions')}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sortedRoster.map((student) => {
                const a = attendanceByStudent.get(student.id)
                const tone = a ? statusTone[a.status] : 'notyet'
                const statusKey = a ? a.status : 'not_yet'
                return (
                  <tr key={student.id}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <Avatar name={student.fullName} src={student.photoUrl} size="sm" />
                        <div className="min-w-0">
                          <p className="truncate font-medium text-slate-900">{student.fullName}</p>
                          <p className="text-xs text-slate-500">{student.rollNumber}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={tone}>{t(`teacher.today.status.${statusKey}`)}</Badge>
                      {a?.isManual ? (
                        <span className="ml-2 text-[10px] font-medium uppercase tracking-wide text-slate-400">
                          {t('teacher.today.manualBadge')}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 tabular-nums text-slate-700">
                      {a?.firstInAt ? formatTimeInKarachi(a.firstInAt) : '—'}
                    </td>
                    <td className="px-4 py-3 tabular-nums text-slate-700">
                      {a?.lastOutAt ? formatTimeInKarachi(a.lastOutAt) : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            setOverride({
                              student,
                              direction: a?.firstInAt ? 'out' : 'in',
                              reason: '',
                            })
                          }
                        >
                          {t('teacher.today.override')}
                        </Button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {override ? (
        <div
          role="dialog"
          aria-label={t('teacher.today.overrideDialogTitle', { name: override.student.fullName })}
          className="fixed inset-0 z-20 flex items-center justify-center bg-slate-900/40 p-4"
        >
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="text-lg font-semibold text-slate-900">
              {t('teacher.today.overrideDialogTitle', { name: override.student.fullName })}
            </h2>
            <p className="mt-1 text-sm text-slate-600">{t('teacher.today.overrideDialogBody')}</p>

            <div className="mt-4">
              <p className="block text-sm font-medium text-slate-700">
                {t('teacher.today.directionLabel')}
              </p>
              <div className="mt-1 grid grid-cols-2 gap-1 rounded-lg bg-slate-100 p-1">
                {(['in', 'out'] as const).map((dir) => (
                  <button
                    key={dir}
                    type="button"
                    aria-pressed={override.direction === dir}
                    onClick={() => setOverride({ ...override, direction: dir })}
                    className={
                      override.direction === dir
                        ? 'rounded-md bg-white px-3 py-1.5 text-sm font-medium text-slate-900 shadow-sm'
                        : 'rounded-md px-3 py-1.5 text-sm font-medium text-slate-600 hover:text-slate-900'
                    }
                  >
                    {t(`teacher.today.direction.${dir}`)}
                  </button>
                ))}
              </div>
            </div>

            <label className="mt-4 block text-sm font-medium text-slate-700">
              {t('teacher.today.reasonLabel')}
              <textarea
                value={override.reason}
                onChange={(e) => setOverride({ ...override, reason: e.target.value })}
                rows={3}
                required
                placeholder={t('teacher.today.reasonPlaceholder')}
                className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
              />
              <span className="mt-1 block text-xs text-slate-500">
                {t('teacher.today.reasonHelp')}
              </span>
            </label>

            <div className="mt-5 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setOverride(null)}>
                {t('common.cancel')}
              </Button>
              <Button
                onClick={submitOverride}
                isLoading={manualTap.isPending}
                disabled={!override.reason.trim() || manualTap.isPending}
              >
                {t('teacher.today.submitOverride')}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
