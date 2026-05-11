import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'

import { Button } from '../../components/atoms/Button'
import { Spinner } from '../../components/atoms/Spinner'
import { ChildCard } from '../../components/molecules/ChildCard'
import { useTodayAttendance } from '../../features/attendance/queries'
import { useMeQuery } from '../../features/auth/queries'
import { useDevicesQuery } from '../../features/devices/queries'
import { useAuthStore } from '../../stores/auth'
import type { Device, School, Student } from '../../types/schemas'
import { deriveLiveStatus } from '../../utils/attendanceStatus'

interface ChildRowProps {
  student: Student
  school: School
  devices: Device[]
}

function ChildRow({ student, school, devices }: ChildRowProps) {
  const navigate = useNavigate()
  const today = useTodayAttendance(student.id, school)

  if (today.isLoading) {
    return (
      <div
        data-testid={`child-card-loading-${student.id}`}
        className="flex items-center justify-center rounded-2xl bg-white p-8 shadow-sm ring-1 ring-slate-200"
      >
        <Spinner />
      </div>
    )
  }

  const status = deriveLiveStatus({
    student,
    attendance: today.data ?? null,
    school,
    devices,
    now: new Date(),
  })

  return (
    <ChildCard
      student={student}
      status={status}
      onOpenTimeline={() => navigate(`/parent/child/${student.id}/timeline`)}
    />
  )
}

export function ParentHomePage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const clearAuth = useAuthStore((s) => s.clearAuth)
  const me = useMeQuery()
  const devicesQuery = useDevicesQuery()

  const onSignOut = () => {
    clearAuth()
    navigate('/login', { replace: true })
  }

  const isLoading = me.isLoading || devicesQuery.isLoading

  return (
    <main className="min-h-dvh bg-slate-50">
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-md items-center justify-between px-5 py-4">
          <div>
            <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500">
              {t('app.name')}
            </p>
            <p className="text-sm font-medium text-slate-900">
              {me.data ? t('parent.greeting', { name: me.data.user.fullName }) : ''}
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={onSignOut}>
            {t('common.signOut')}
          </Button>
        </div>
      </header>

      <div className="mx-auto max-w-md space-y-4 p-5">
        {isLoading ? (
          <div
            role="status"
            aria-label={t('common.loading')}
            className="flex items-center justify-center rounded-2xl bg-white p-12 shadow-sm ring-1 ring-slate-200"
          >
            <Spinner />
          </div>
        ) : me.isError ? (
          <div
            role="alert"
            className="rounded-2xl bg-status-alarm/10 p-5 text-sm text-status-alarm"
          >
            <p className="font-medium">{t('parent.loadError')}</p>
            <Button
              variant="secondary"
              size="sm"
              className="mt-3"
              onClick={() => {
                void me.refetch()
                void devicesQuery.refetch()
              }}
            >
              {t('common.retry')}
            </Button>
          </div>
        ) : (me.data?.children ?? []).length === 0 ? (
          <div className="rounded-2xl bg-white p-6 text-sm text-slate-600 shadow-sm ring-1 ring-slate-200">
            {t('parent.noChildren')}
          </div>
        ) : (
          (me.data?.children ?? []).map((child) => (
            <ChildRow
              key={child.id}
              student={child}
              school={me.data!.school}
              devices={devicesQuery.data ?? []}
            />
          ))
        )}
      </div>
    </main>
  )
}
