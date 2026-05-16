import { AlertTriangle } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { formatInTimeZone } from 'date-fns-tz'

import {
  DashboardStatRow,
  DashboardStatRowSkeleton,
} from '../../components/organisms/DashboardStatRow'
import { DeviceStatusList } from '../../components/organisms/DeviceStatusList'
import { LiveTapFeed } from '../../components/organisms/LiveTapFeed'
import { StatusCard } from '../../components/molecules/StatusCard'
import { useTodayAttendanceAll } from '../../features/attendance/queries'
import { useMeQuery } from '../../features/auth/queries'
import { computeDashboardStats } from '../../utils/dashboardStats'
import { KARACHI_TZ } from '../../utils/datetime'

export function AdminDashboardPage() {
  const { t } = useTranslation()
  const me = useMeQuery()
  const todayAttendance = useTodayAttendanceAll(me.data?.school)

  const stats =
    me.data?.school && todayAttendance.data
      ? computeDashboardStats(todayAttendance.data, me.data.school, new Date())
      : null

  const todayLabel = formatInTimeZone(new Date(), KARACHI_TZ, 'EEEE, MMM d')

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
