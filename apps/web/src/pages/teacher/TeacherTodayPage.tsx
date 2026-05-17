import { useMemo, useState } from 'react'
import { LogIn, LogOut, UserX, Users } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Avatar } from '../../components/atoms/Avatar'
import { Badge } from '../../components/atoms/Badge'
import { Button } from '../../components/atoms/Button'
import { Modal } from '../../components/molecules/Modal'
import { StatusCard } from '../../components/molecules/StatusCard'
import { useClassAttendanceToday, useManualTapMutation } from '../../features/attendance/queries'
import { useMeQuery } from '../../features/auth/queries'
import { useStudentsQuery } from '../../features/students/queries'
import type { AttendanceRecord, Student, TapDirection, TapEventReasonKind } from '@fyntra/schemas'
import { formatTimeInKarachi } from '../../utils/datetime'

const statusTone: Record<AttendanceRecord['status'], 'present' | 'late' | 'absent' | 'notyet'> = {
  present: 'present',
  late: 'late',
  absent: 'absent',
  left_early: 'late',
  unverified: 'notyet',
}

// Default reasonKind tracks the direction the teacher is correcting:
// - `in` (no tap-in yet): probably forgot the card → forgot_card.
// - `out` (forgot to tap out): probably an early pickup → early_pickup.
const REASON_KINDS: TapEventReasonKind[] = [
  'forgot_card',
  'out_of_band_tap',
  'sick',
  'leave',
  'half_day',
  'early_pickup',
  'late_arrival',
  'in_school_not_in_class',
  'other',
]

interface OverrideState {
  student: Student
  direction: TapDirection
  reasonKind: TapEventReasonKind
  reason: string
}

type RosterFilter = 'all' | 'not_yet' | 'late' | 'absent' | 'left_early'

const ROSTER_FILTERS: RosterFilter[] = ['all', 'not_yet', 'late', 'absent', 'left_early']

const filterLabelKey: Record<RosterFilter, string> = {
  all: 'teacher.today.filter.all',
  not_yet: 'teacher.today.status.not_yet',
  late: 'teacher.today.status.late',
  absent: 'teacher.today.status.absent',
  left_early: 'teacher.today.status.left_early',
}

function RosterRowSkeleton() {
  return (
    <tr aria-hidden="true" className="animate-pulse">
      <td className="px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-full bg-stone-100" />
          <div className="space-y-1.5">
            <div className="h-3.5 w-32 rounded bg-stone-100" />
            <div className="h-3 w-16 rounded bg-stone-100" />
          </div>
        </div>
      </td>
      <td className="px-4 py-3">
        <div className="h-5 w-16 rounded-full bg-stone-100" />
      </td>
      <td className="px-4 py-3">
        <div className="h-3.5 w-14 rounded bg-stone-100" />
      </td>
      <td className="px-4 py-3">
        <div className="h-3.5 w-14 rounded bg-stone-100" />
      </td>
      <td className="px-4 py-3">
        <div className="ml-auto h-7 w-16 rounded-md bg-stone-100" />
      </td>
    </tr>
  )
}

function MobileRosterCardSkeleton() {
  return (
    <div
      aria-hidden="true"
      className="animate-pulse rounded-2xl bg-white p-4 shadow-elev-1 ring-1 ring-stone-200"
    >
      <div className="flex items-start gap-3">
        <div className="h-8 w-8 rounded-full bg-stone-100" />
        <div className="flex-1 space-y-1.5">
          <div className="h-3.5 w-36 rounded bg-stone-100" />
          <div className="h-3 w-16 rounded bg-stone-100" />
        </div>
      </div>
      <div className="mt-3 h-5 w-20 rounded-full bg-stone-100" />
      <div className="mt-3 h-3 w-32 rounded bg-stone-100" />
      <div className="mt-4 h-11 w-full rounded-lg bg-stone-100" />
    </div>
  )
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
  const [filter, setFilter] = useState<RosterFilter>('all')

  const attendanceByStudent = useMemo(
    () => new Map((attendance.data ?? []).map((a) => [a.studentId, a])),
    [attendance.data],
  )
  const sortedRoster = useMemo(
    () =>
      [...(students.data ?? [])].sort((a, b) =>
        a.rollNumber.localeCompare(b.rollNumber),
      ),
    [students.data],
  )

  const filterCounts = useMemo(() => {
    const c: Record<RosterFilter, number> = {
      all: sortedRoster.length,
      not_yet: 0,
      late: 0,
      absent: 0,
      left_early: 0,
    }
    for (const s of sortedRoster) {
      const a = attendanceByStudent.get(s.id)
      if (!a) {
        c.not_yet += 1
        continue
      }
      if (a.status === 'late') c.late += 1
      else if (a.status === 'absent') c.absent += 1
      else if (a.status === 'left_early') c.left_early += 1
    }
    return c
  }, [sortedRoster, attendanceByStudent])

  const filteredRoster = useMemo(() => {
    if (filter === 'all') return sortedRoster
    return sortedRoster.filter((s) => {
      const a = attendanceByStudent.get(s.id)
      if (filter === 'not_yet') return !a
      if (!a) return false
      return a.status === filter
    })
  }, [sortedRoster, attendanceByStudent, filter])

  const submitOverride = () => {
    if (!override || !override.reason.trim()) return
    setBanner(null)
    manualTap.mutate(
      {
        studentId: override.student.id,
        direction: override.direction,
        occurredAt: new Date().toISOString(),
        reasonKind: override.reasonKind,
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
      <div aria-busy="true" aria-label={t('common.loading')} className="space-y-5">
        <div className="animate-pulse">
          <div className="h-7 w-40 rounded bg-stone-100" />
          <div className="mt-1.5 h-3.5 w-56 rounded bg-stone-100" />
        </div>
        <div className="overflow-hidden rounded-2xl bg-white shadow-elev-1 ring-1 ring-stone-200">
          <div className="h-12 animate-pulse border-b border-stone-200 bg-stone-50" />
          <ul className="animate-pulse divide-y divide-stone-100">
            {Array.from({ length: 6 }).map((_, i) => (
              <li key={i} className="flex items-center gap-3 px-4 py-3">
                <div className="h-8 w-8 rounded-full bg-stone-100" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-3.5 w-32 rounded bg-stone-100" />
                  <div className="h-3 w-16 rounded bg-stone-100" />
                </div>
                <div className="h-5 w-16 rounded-full bg-stone-100" />
                <div className="ml-3 h-7 w-16 rounded-md bg-stone-100" />
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

  const isLoadingRoster = students.isLoading || attendance.isLoading

  return (
    <div className="space-y-5">
      <header className="flex items-baseline justify-between gap-2">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-stone-900">
            {klass.name}
          </h1>
          <p className="mt-0.5 text-sm text-stone-500">{t('teacher.today.subtitle')}</p>
        </div>
        {students.data ? (
          <span className="font-mono text-sm tabular-nums text-stone-500">
            {t('teacher.today.studentCount', { count: students.data.length })}
          </span>
        ) : null}
      </header>

      {banner ? (
        <div
          role={banner.kind === 'error' ? 'alert' : 'status'}
          className={
            banner.kind === 'success'
              ? 'rounded-lg bg-status-present/10 px-3 py-2 text-sm text-status-present ring-1 ring-status-present/20'
              : 'rounded-lg bg-status-alarm/10 px-3 py-2 text-sm text-status-alarm ring-1 ring-status-alarm/20'
          }
        >
          {banner.text}
        </div>
      ) : null}

      {!isLoadingRoster && sortedRoster.length > 0 ? (
        <div role="tablist" aria-label={t('teacher.today.filter.label')} className="flex flex-wrap gap-2">
          {ROSTER_FILTERS.map((f) => {
            const active = filter === f
            return (
              <button
                key={f}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setFilter(f)}
                className={
                  active
                    ? 'inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-3 py-1.5 text-sm font-medium text-brand-700 ring-1 ring-inset ring-brand-100 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500'
                    : 'inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-sm font-medium text-stone-600 ring-1 ring-inset ring-stone-200 transition-colors hover:bg-stone-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500'
                }
              >
                <span>{t(filterLabelKey[f])}</span>
                <span
                  className={
                    active
                      ? 'font-mono text-xs tabular-nums text-brand-700/80'
                      : 'font-mono text-xs tabular-nums text-stone-400'
                  }
                >
                  {filterCounts[f]}
                </span>
              </button>
            )
          })}
        </div>
      ) : null}

      {!isLoadingRoster && sortedRoster.length === 0 ? (
        <StatusCard icon={Users} body={t('teacher.today.empty')} />
      ) : (
        <>
        <div className="hidden overflow-hidden rounded-2xl bg-white shadow-elev-1 ring-1 ring-stone-200 sm:block">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-stone-200 text-sm">
              <thead className="bg-stone-50 text-micro uppercase text-stone-500">
                <tr>
                  <th scope="col" className="px-4 py-3 text-left font-semibold">
                    {t('teacher.today.table.name')}
                  </th>
                  <th scope="col" className="px-4 py-3 text-left font-semibold">
                    {t('teacher.today.table.status')}
                  </th>
                  <th scope="col" className="px-4 py-3 text-left font-semibold">
                    {t('teacher.today.table.firstIn')}
                  </th>
                  <th scope="col" className="px-4 py-3 text-left font-semibold">
                    {t('teacher.today.table.lastOut')}
                  </th>
                  <th scope="col" className="px-4 py-3 text-right font-semibold">
                    {t('teacher.today.table.actions')}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {isLoadingRoster ? (
                  Array.from({ length: 6 }).map((_, i) => <RosterRowSkeleton key={i} />)
                ) : filteredRoster.length === 0 ? (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-4 py-8 text-center text-sm text-stone-500"
                    >
                      {t('teacher.today.filter.noMatch')}
                    </td>
                  </tr>
                ) : (
                  filteredRoster.map((student) => {
                      const a = attendanceByStudent.get(student.id)
                      const tone = a ? statusTone[a.status] : 'notyet'
                      const statusKey = a ? a.status : 'not_yet'
                      return (
                        <tr key={student.id} className="transition-colors hover:bg-stone-50">
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-3">
                              <Avatar
                                name={student.fullName}
                                src={student.photoUrl}
                                size="sm"
                              />
                              <div className="min-w-0">
                                <p className="truncate font-medium text-stone-900">
                                  {student.fullName}
                                </p>
                                <p className="font-mono text-xs text-stone-500">
                                  {student.rollNumber}
                                </p>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <Badge tone={tone} size="md">
                                {t(`teacher.today.status.${statusKey}`)}
                              </Badge>
                              {a?.isManual ? (
                                <Badge tone="neutral">
                                  {t('teacher.today.manualBadge')}
                                </Badge>
                              ) : null}
                            </div>
                          </td>
                          <td className="px-4 py-3 font-mono tabular-nums text-stone-700">
                            {a?.firstInAt ? formatTimeInKarachi(a.firstInAt) : '—'}
                          </td>
                          <td className="px-4 py-3 font-mono tabular-nums text-stone-700">
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
                                    reasonKind: a?.firstInAt ? 'early_pickup' : 'forgot_card',
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
                    })
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="space-y-3 sm:hidden">
          {isLoadingRoster ? (
            Array.from({ length: 6 }).map((_, i) => <MobileRosterCardSkeleton key={i} />)
          ) : filteredRoster.length === 0 ? (
            <div className="rounded-2xl bg-white p-6 text-center text-sm text-stone-500 shadow-elev-1 ring-1 ring-stone-200">
              {t('teacher.today.filter.noMatch')}
            </div>
          ) : (
            filteredRoster.map((student) => {
              const a = attendanceByStudent.get(student.id)
              const tone = a ? statusTone[a.status] : 'notyet'
              const statusKey = a ? a.status : 'not_yet'
              return (
                <article
                  key={student.id}
                  className="rounded-2xl bg-white p-4 shadow-elev-1 ring-1 ring-stone-200"
                >
                  <div className="flex items-start gap-3">
                    <Avatar name={student.fullName} src={student.photoUrl} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-stone-900">
                        {student.fullName}
                      </p>
                      <p className="font-mono text-xs text-stone-500">
                        {student.rollNumber}
                      </p>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <Badge tone={tone} size="md">
                      {t(`teacher.today.status.${statusKey}`)}
                    </Badge>
                    {a?.isManual ? (
                      <Badge tone="neutral">{t('teacher.today.manualBadge')}</Badge>
                    ) : null}
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-stone-700">
                    <span className="inline-flex items-center gap-1.5">
                      <LogIn aria-hidden="true" className="h-3.5 w-3.5 text-stone-400" />
                      <span className="font-mono tabular-nums">
                        {a?.firstInAt ? formatTimeInKarachi(a.firstInAt) : '—'}
                      </span>
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <LogOut aria-hidden="true" className="h-3.5 w-3.5 text-stone-400" />
                      <span className="font-mono tabular-nums">
                        {a?.lastOutAt ? formatTimeInKarachi(a.lastOutAt) : '—'}
                      </span>
                    </span>
                  </div>
                  <Button
                    variant="secondary"
                    size="md"
                    className="mt-4 w-full"
                    onClick={() =>
                      setOverride({
                        student,
                        direction: a?.firstInAt ? 'out' : 'in',
                        reasonKind: a?.firstInAt ? 'early_pickup' : 'forgot_card',
                        reason: '',
                      })
                    }
                  >
                    {t('teacher.today.override')}
                  </Button>
                </article>
              )
            })
          )}
        </div>
        </>
      )}

      {override ? (
        <Modal
          label={t('teacher.today.overrideDialogTitle', { name: override.student.fullName })}
        >
          <h2 className="font-display text-lg font-semibold tracking-tight text-stone-900">
              {t('teacher.today.overrideDialogTitle', { name: override.student.fullName })}
            </h2>
            <p className="mt-1 text-sm text-stone-600">{t('teacher.today.overrideDialogBody')}</p>

            <div className="mt-5">
              <p className="block text-sm font-medium text-stone-700">
                {t('teacher.today.directionLabel')}
              </p>
              <div className="mt-1.5 grid grid-cols-2 gap-1 rounded-lg bg-stone-100 p-1">
                {(['in', 'out'] as const).map((dir) => (
                  <button
                    key={dir}
                    type="button"
                    aria-pressed={override.direction === dir}
                    onClick={() => setOverride({ ...override, direction: dir })}
                    className={
                      override.direction === dir
                        ? 'rounded-md bg-white px-3 py-1.5 text-sm font-medium text-stone-900 shadow-elev-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-500'
                        : 'rounded-md px-3 py-1.5 text-sm font-medium text-stone-600 transition-colors hover:text-stone-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-500'
                    }
                  >
                    {t(`teacher.today.direction.${dir}`)}
                  </button>
                ))}
              </div>
            </div>

            <label className="mt-5 block text-sm font-medium text-stone-700">
              {t('teacher.today.reasonKindLabel')}
              <select
                value={override.reasonKind}
                onChange={(e) => setOverride({ ...override, reasonKind: e.target.value as TapEventReasonKind })}
                className="mt-1.5 block w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
              >
                {REASON_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {t(`teacher.today.reasonKind.${k}`)}
                  </option>
                ))}
              </select>
              <span className="mt-1.5 block text-xs text-stone-500">
                {t('teacher.today.reasonKindHelp')}
              </span>
            </label>

            <label className="mt-4 block text-sm font-medium text-stone-700">
              {t('teacher.today.reasonLabel')}
              <textarea
                value={override.reason}
                onChange={(e) => setOverride({ ...override, reason: e.target.value })}
                rows={3}
                required
                placeholder={t('teacher.today.reasonPlaceholder')}
                className="mt-1.5 block w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 placeholder:text-stone-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
              />
              <span className="mt-1.5 block text-xs text-stone-500">
                {t('teacher.today.reasonHelp')}
              </span>
            </label>

            <div className="mt-6 flex justify-end gap-2">
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
          </Modal>
      ) : null}
    </div>
  )
}
