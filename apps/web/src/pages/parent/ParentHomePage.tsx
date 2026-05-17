import { AlertTriangle, Settings as SettingsIcon, Users } from 'lucide-react'
import { formatInTimeZone } from 'date-fns-tz'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'

import { Button } from '../../components/atoms/Button'
import { Icon } from '../../components/atoms/Icon'
import { AttendanceSummaryCard } from '../../components/molecules/AttendanceSummaryCard'
import { ChildCard } from '../../components/molecules/ChildCard'
import { FreshnessChip } from '../../components/molecules/FreshnessChip'
import { StatusCard } from '../../components/molecules/StatusCard'
import { useStudentAttendanceSummary } from '../../features/students/queries'
import {
  useChildrenTodayAttendance,
  useChildrenTodayTaps,
} from '../../features/attendance/queries'
import { useMeQuery } from '../../features/auth/queries'
import { useDevicesQuery } from '../../features/devices/queries'
import { useAuthStore } from '../../stores/auth'
import type { Student } from '@fyntra/schemas'
import {
  compareByUrgency,
  deriveLiveStatus,
  needsAttention,
  type LiveStatus,
} from '../../utils/attendanceStatus'
import { KARACHI_TZ } from '../../utils/datetime'

interface ChildEntry {
  student: Student
  status: LiveStatus | null
  isLoading: boolean
  lastDeviceLabel?: string
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

export function ParentHomePage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const clearAuth = useAuthStore((s) => s.clearAuth)
  const me = useMeQuery()
  const devicesQuery = useDevicesQuery()

  const children = me.data?.children ?? []
  const school = me.data?.school
  const devices = devicesQuery.data ?? []

  // Fan-out today's attendance for every child in one go so we can sort the
  // list by urgency before rendering. Shares cache keys with single-student
  // useTodayAttendance, so the timeline page is hot on navigate.
  const attendanceQueries = useChildrenTodayAttendance(children, school)
  // Fan-out today's taps too — we need the device of the most recent tap to
  // render the "Last seen at" row on the card. Shared cache with the timeline
  // page's per-day tap query.
  const tapsQueries = useChildrenTodayTaps(children)

  const devicesById = new Map(devices.map((d) => [d.id, d]))

  const entries: ChildEntry[] = children.map((student, idx) => {
    const q = attendanceQueries[idx]
    const isLoading = !school || !q || q.isLoading
    const status =
      school && q && !q.isLoading
        ? deriveLiveStatus({
            student,
            attendance: q.data ?? null,
            school,
            devices,
            now: new Date(),
          })
        : null

    const taps = tapsQueries[idx]?.data ?? []
    const lastTap = taps.reduce<(typeof taps)[number] | null>((latest, tap) => {
      if (!latest) return tap
      return tap.occurredAt > latest.occurredAt ? tap : latest
    }, null)
    const lastDeviceLabel = lastTap?.deviceId
      ? devicesById.get(lastTap.deviceId)?.label
      : undefined

    return { student, status, isLoading, lastDeviceLabel }
  })

  const sortedEntries = [...entries].sort((a, b) => {
    if (a.status && b.status) return compareByUrgency(a.status, b.status)
    if (!a.status && !b.status) return 0
    return a.status ? -1 : 1 // resolved entries first
  })

  const needsAttentionCount = entries.filter(
    (e) => e.status && needsAttention(e.status),
  ).length
  const showSummary = children.length > 1 && needsAttentionCount > 0

  const onSignOut = () => {
    clearAuth()
    navigate('/login', { replace: true })
  }

  const isPageLoading = me.isLoading || devicesQuery.isLoading
  const todayLabel = formatInTimeZone(new Date(), KARACHI_TZ, 'EEEE, MMM d')

  // Freshness = the most recently refreshed attendance query. The polling
  // window controls how fast this advances; outside school hours the chip
  // legitimately drifts into "stale" / "cold" until the next page open.
  const lastUpdatedAt = attendanceQueries.reduce<number | null>((acc, q) => {
    if (!q.dataUpdatedAt) return acc
    return acc === null || q.dataUpdatedAt > acc ? q.dataUpdatedAt : acc
  }, null)

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
            {me.data ? t('parent.greeting', { name: me.data.user.fullName }) : ' '}
          </h1>
          <div className="mt-1 flex items-center gap-2 text-sm text-stone-500">
            <span>{todayLabel}</span>
            {lastUpdatedAt ? (
              <>
                <span aria-hidden="true" className="text-stone-300">
                  ·
                </span>
                <FreshnessChip updatedAt={lastUpdatedAt} />
              </>
            ) : null}
          </div>
        </div>

        {showSummary ? (
          <div
            role="status"
            className="flex items-center gap-2 rounded-lg bg-status-late/10 px-3 py-2 ring-1 ring-status-late/20"
          >
            <Icon icon={AlertTriangle} size="sm" className="text-status-late" />
            <p className="text-sm font-medium text-status-late">
              {t('parent.summary.needsAttention', { count: needsAttentionCount })}
            </p>
          </div>
        ) : null}

        {isPageLoading ? (
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
        ) : children.length === 0 ? (
          <StatusCard icon={Users} body={t('parent.noChildren')} />
        ) : (
          sortedEntries.map((entry) =>
            entry.isLoading || !entry.status ? (
              <ChildCardSkeleton key={entry.student.id} />
            ) : (
              <div key={entry.student.id} className="space-y-2">
                <ChildCard
                  student={entry.student}
                  status={entry.status}
                  lastDeviceLabel={entry.lastDeviceLabel}
                  onOpenTimeline={() =>
                    navigate(`/parent/child/${entry.student.id}/timeline`)
                  }
                />
                <ChildMonthSummary studentId={entry.student.id} />
              </div>
            ),
          )
        )}
      </div>
    </main>
  )
}

// Compact "this month" row under each ChildCard. Pulls its own summary so
// the home page doesn't have to fan out queries up-front; React Query
// dedupes the cache across mounts within the staleTime window.
function ChildMonthSummary({ studentId }: { studentId: string }) {
  const summary = useStudentAttendanceSummary(studentId)
  if (!summary.data) return null
  return (
    <div className="px-1">
      <AttendanceSummaryCard summary={summary.data} variant="inline" />
    </div>
  )
}
