import { AlertTriangle, CheckCircle2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { formatInTimeZone } from 'date-fns-tz'

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
