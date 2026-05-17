import { AlertTriangle, CheckCircle2, Lock } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { formatInTimeZone } from 'date-fns-tz'
import { Link } from 'react-router-dom'

import { Icon } from '../../components/atoms/Icon'
import {
  DashboardStatRow,
  DashboardStatRowSkeleton,
} from '../../components/organisms/DashboardStatRow'
import { DeviceStatusList } from '../../components/organisms/DeviceStatusList'
import { LiveTapFeed } from '../../components/organisms/LiveTapFeed'
import { StatusCard } from '../../components/molecules/StatusCard'
import {
  useAnomalyList,
  useTodayAttendanceAll,
} from '../../features/attendance/queries'
import { useMeQuery } from '../../features/auth/queries'
import { useTodaySummary } from '../../features/register/queries'
import { computeDashboardStats } from '../../utils/dashboardStats'
import { cn } from '../../utils/cn'
import { dateStrInKarachi, KARACHI_TZ } from '../../utils/datetime'

function from7DaysAgo(): string {
  return dateStrInKarachi(new Date(Date.now() - 7 * 86400000))
}

export function AdminDashboardPage() {
  const { t } = useTranslation()
  const me = useMeQuery()
  const todayAttendance = useTodayAttendanceAll(me.data?.school)

  // Shares the same query as AdminLayout's sidebar badge (7-day window),
  // so the cache is warm and the headline matches the badge.
  const anomalies = useAnomalyList(from7DaysAgo(), dateStrInKarachi())

  const stats =
    me.data?.school && todayAttendance.data
      ? computeDashboardStats(todayAttendance.data, me.data.school, new Date())
      : null

  const todayLabel = formatInTimeZone(new Date(), KARACHI_TZ, 'EEEE, MMM d')
  const anomalyCount = anomalies.data?.length ?? 0
  const hasAnomalyData = !anomalies.isLoading && anomalies.isSuccess
  const allClear = hasAnomalyData && anomalyCount === 0
  const needsReview = hasAnomalyData && anomalyCount > 0

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-2xl font-semibold tracking-tight text-stone-900">
          {t('admin.dashboardTitle')}
        </h1>
        <p className="mt-0.5 text-sm text-stone-500">
          {t('admin.today', { date: todayLabel })}
        </p>
      </header>

      {me.isError ? (
        <StatusCard
          tone="alarm"
          icon={AlertTriangle}
          body={t('admin.loadError')}
          action={{
            label: t('common.retry'),
            onClick: () => void me.refetch(),
          }}
        />
      ) : (
        <>
          {allClear || needsReview ? (
            <div
              role="status"
              className={cn(
                'flex items-center gap-3 rounded-2xl bg-white px-5 py-4 shadow-elev-1 ring-1 ring-stone-200',
              )}
            >
              {allClear ? (
                <CheckCircle2
                  aria-hidden="true"
                  className="h-7 w-7 flex-shrink-0 text-status-present"
                />
              ) : (
                <AlertTriangle
                  aria-hidden="true"
                  className="h-7 w-7 flex-shrink-0 text-status-late"
                />
              )}
              <h2
                className={cn(
                  'font-display text-display font-semibold tracking-tight',
                  allClear ? 'text-status-present' : 'text-status-late',
                )}
              >
                {allClear
                  ? t('admin.anomalyHeadline.allClear')
                  : t('admin.anomalyHeadline.needsReview', { count: anomalyCount })}
              </h2>
            </div>
          ) : null}

          {stats ? <DashboardStatRow stats={stats} /> : <DashboardStatRowSkeleton />}

          <TodayRegisterRollup />

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <LiveTapFeed school={me.data?.school} />
            </div>
            <div>
              <DeviceStatusList />
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// Today's register — one row per class with lock state + totals. Reads
// /attendance/today-summary; admin-only so we don't need to gate here.
function TodayRegisterRollup() {
  const { t } = useTranslation()
  const summary = useTodaySummary()
  if (summary.isLoading) {
    return (
      <section aria-busy="true" aria-label={t('common.loading')}>
        <div className="h-32 animate-pulse rounded-2xl bg-stone-100" />
      </section>
    )
  }
  if (summary.isError || !summary.data) {
    return null
  }
  const { classes: rows } = summary.data
  if (rows.length === 0) return null
  const lockedCount = rows.filter((c) => c.locked).length
  return (
    <section className="rounded-2xl bg-white p-5 shadow-elev-1 ring-1 ring-stone-200">
      <header className="flex items-baseline justify-between">
        <h2 className="text-micro font-semibold uppercase tracking-wide text-stone-500">
          {t('admin.todayRegister.title')}
        </h2>
        <span className="font-mono text-xs tabular-nums text-stone-500">
          {t('admin.todayRegister.lockedOf', { locked: lockedCount, total: rows.length })}
        </span>
      </header>
      <ul className="mt-3 divide-y divide-stone-100">
        {rows.map((c) => (
          <li key={c.classId} className="flex items-center gap-3 py-2 text-sm">
            <Link
              to="/admin/register"
              className="flex-1 truncate font-medium text-stone-900 hover:text-brand-700"
            >
              {c.className}
            </Link>
            {c.locked ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-status-present/10 px-2 py-0.5 text-xs font-medium text-status-present ring-1 ring-status-present/30">
                <Icon icon={Lock} size="sm" />
                {t('admin.todayRegister.locked')}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full bg-status-late/10 px-2 py-0.5 text-xs font-medium text-status-late ring-1 ring-status-late/30">
                {t('admin.todayRegister.pending')}
              </span>
            )}
            <span className="font-mono text-xs tabular-nums text-stone-500">
              <span className="text-status-present">{c.totals.present}P</span>
              {' · '}
              <span className="text-status-late">{c.totals.late}L</span>
              {' · '}
              <span className="text-status-absent">{c.totals.absent}A</span>
              {c.totals.noRecord > 0 ? (
                <>
                  {' · '}
                  <span className="text-stone-400">{c.totals.noRecord}—</span>
                </>
              ) : null}
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}
