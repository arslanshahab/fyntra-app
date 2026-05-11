import { useTranslation } from 'react-i18next'
import { formatInTimeZone } from 'date-fns-tz'

import { Button } from '../../components/atoms/Button'
import { Spinner } from '../../components/atoms/Spinner'
import { DashboardStatRow } from '../../components/organisms/DashboardStatRow'
import { DeviceStatusList } from '../../components/organisms/DeviceStatusList'
import { LiveTapFeed } from '../../components/organisms/LiveTapFeed'
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

  if (me.isError) {
    return (
      <div role="alert" className="rounded-2xl bg-status-alarm/10 p-5 text-sm text-status-alarm">
        <p className="font-medium">{t('admin.loadError')}</p>
        <Button variant="secondary" size="sm" className="mt-3" onClick={() => void me.refetch()}>
          {t('common.retry')}
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-slate-500">{t('admin.today', { date: todayLabel })}</p>

      {stats ? (
        <DashboardStatRow stats={stats} />
      ) : (
        <div
          role="status"
          aria-label={t('common.loading')}
          className="flex items-center justify-center rounded-2xl bg-white p-12 shadow-sm ring-1 ring-slate-200"
        >
          <Spinner />
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <LiveTapFeed school={me.data?.school} />
        </div>
        <div>
          <DeviceStatusList />
        </div>
      </div>
    </div>
  )
}
