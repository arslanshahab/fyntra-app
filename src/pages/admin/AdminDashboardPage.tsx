import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { formatInTimeZone } from 'date-fns-tz'

import { Button } from '../../components/atoms/Button'
import { Spinner } from '../../components/atoms/Spinner'
import { DashboardStatRow } from '../../components/organisms/DashboardStatRow'
import { DeviceStatusList } from '../../components/organisms/DeviceStatusList'
import { LiveTapFeed } from '../../components/organisms/LiveTapFeed'
import { useTodayAttendanceAll } from '../../features/attendance/queries'
import { useMeQuery } from '../../features/auth/queries'
import { useAuthStore } from '../../stores/auth'
import { computeDashboardStats } from '../../utils/dashboardStats'
import { KARACHI_TZ } from '../../utils/datetime'

export function AdminDashboardPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const clearAuth = useAuthStore((s) => s.clearAuth)
  const me = useMeQuery()
  const todayAttendance = useTodayAttendanceAll(me.data?.school)

  const stats =
    me.data?.school && todayAttendance.data
      ? computeDashboardStats(todayAttendance.data, me.data.school, new Date())
      : null

  const onSignOut = () => {
    clearAuth()
    navigate('/login', { replace: true })
  }

  const todayLabel = formatInTimeZone(new Date(), KARACHI_TZ, 'EEEE, MMM d')

  return (
    <main className="min-h-dvh bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-4">
          <div>
            <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500">
              {t('app.name')} · {t('admin.dashboardTitle')}
            </p>
            <p className="text-sm font-medium text-slate-900">
              {me.data ? t('admin.today', { date: todayLabel }) : ''}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {me.data ? (
              <span className="hidden text-xs text-slate-500 sm:inline">
                {me.data.user.fullName}
              </span>
            ) : null}
            <Button variant="ghost" size="sm" onClick={onSignOut}>
              {t('common.signOut')}
            </Button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-6xl space-y-6 p-6">
        {me.isLoading ? (
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
            <p className="font-medium">{t('admin.loadError')}</p>
            <Button
              variant="secondary"
              size="sm"
              className="mt-3"
              onClick={() => void me.refetch()}
            >
              {t('common.retry')}
            </Button>
          </div>
        ) : (
          <>
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
          </>
        )}
      </div>
    </main>
  )
}
