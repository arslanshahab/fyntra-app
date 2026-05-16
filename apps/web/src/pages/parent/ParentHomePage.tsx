import { AlertTriangle, Settings as SettingsIcon, Users } from 'lucide-react'
import { formatInTimeZone } from 'date-fns-tz'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'

import { Button } from '../../components/atoms/Button'
import { Icon } from '../../components/atoms/Icon'
import { ChildCard } from '../../components/molecules/ChildCard'
import { StatusCard } from '../../components/molecules/StatusCard'
import { useTodayAttendance } from '../../features/attendance/queries'
import { useMeQuery } from '../../features/auth/queries'
import { useDevicesQuery } from '../../features/devices/queries'
import { useAuthStore } from '../../stores/auth'
import type { Device, School, Student } from '@fyntra/schemas'
import { deriveLiveStatus } from '../../utils/attendanceStatus'
import { KARACHI_TZ } from '../../utils/datetime'

interface ChildRowProps {
  student: Student
  school: School
  devices: Device[]
}

function ChildCardSkeleton() {
  return (
    <article
      aria-hidden="true"
      className="overflow-hidden rounded-hero bg-white shadow-elev-1 ring-1 ring-stone-200"
    >
      <div className="h-1.5 w-full bg-stone-100" />
      <div className="animate-pulse p-6">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-stone-100" />
          <div className="flex-1 space-y-1.5">
            <div className="h-2.5 w-24 rounded bg-stone-100" />
            <div className="h-4 w-40 rounded bg-stone-100" />
          </div>
        </div>
        <div className="mt-6 space-y-2.5">
          <div className="h-8 w-3/4 rounded bg-stone-100" />
          <div className="h-3.5 w-1/2 rounded bg-stone-100" />
        </div>
        <div className="mt-6 h-12 w-full rounded-xl bg-stone-100" />
      </div>
    </article>
  )
}

function ChildRow({ student, school, devices }: ChildRowProps) {
  const navigate = useNavigate()
  const today = useTodayAttendance(student.id, school)

  if (today.isLoading) {
    return <ChildCardSkeleton />
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
  const todayLabel = formatInTimeZone(new Date(), KARACHI_TZ, 'EEEE, MMM d')

  return (
    <main className="min-h-dvh bg-stone-50">
      <header className="sticky top-0 z-10 border-b border-stone-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-md items-center justify-between px-5 py-3">
          <div className="flex items-center gap-2">
            <div
              aria-hidden="true"
              className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-white shadow-elev-1"
            >
              <span className="font-display text-sm font-bold leading-none">F</span>
            </div>
            <p className="font-display text-base font-semibold tracking-tight text-stone-900">
              {t('app.name')}
            </p>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => navigate('/parent/settings')}
              aria-label={t('parent.openSettings')}
              className="rounded-md p-2 text-stone-600 transition-colors hover:bg-stone-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
            >
              <Icon icon={SettingsIcon} size="md" />
            </button>
            <Button variant="ghost" size="sm" onClick={onSignOut}>
              {t('common.signOut')}
            </Button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-md space-y-4 px-5 pb-10 pt-6">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight text-stone-900">
            {me.data ? t('parent.greeting', { name: me.data.user.fullName }) : ' '}
          </h1>
          <p className="mt-1 text-sm text-stone-500">{todayLabel}</p>
        </div>

        {isLoading ? (
          <ChildCardSkeleton />
        ) : me.isError ? (
          <StatusCard
            tone="alarm"
            icon={AlertTriangle}
            body={t('parent.loadError')}
            action={{
              label: t('common.retry'),
              onClick: () => {
                void me.refetch()
                void devicesQuery.refetch()
              },
            }}
          />
        ) : (me.data?.children ?? []).length === 0 ? (
          <StatusCard icon={Users} body={t('parent.noChildren')} />
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
