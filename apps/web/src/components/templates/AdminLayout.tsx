import {
  AlertTriangle,
  Bell,
  CalendarDays,
  CalendarRange,
  CreditCard,
  FileSpreadsheet,
  Home,
  type LucideIcon,
  Radio,
  Sliders,
  Users,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'

import { Button } from '../atoms/Button'
import { Icon } from '../atoms/Icon'
import { useAnomalyList } from '../../features/attendance/queries'
import { useAuthStore } from '../../stores/auth'
import { cn } from '../../utils/cn'
import { dateStrInKarachi } from '../../utils/datetime'

interface NavItem {
  to: string
  labelKey: string
  icon: LucideIcon
  end?: boolean
}

interface NavGroup {
  labelKey: string
  items: NavItem[]
}

const NAV_GROUPS: NavGroup[] = [
  {
    labelKey: 'admin.nav.section.overview',
    items: [{ to: '/admin', labelKey: 'admin.nav.dashboard', icon: Home, end: true }],
  },
  {
    labelKey: 'admin.nav.section.people',
    items: [
      { to: '/admin/students', labelKey: 'admin.nav.students', icon: Users },
      { to: '/admin/cards', labelKey: 'admin.nav.cards', icon: CreditCard },
      { to: '/admin/register', labelKey: 'admin.nav.register', icon: CalendarRange },
    ],
  },
  {
    labelKey: 'admin.nav.section.infrastructure',
    items: [{ to: '/admin/devices', labelKey: 'admin.nav.devices', icon: Radio }],
  },
  {
    labelKey: 'admin.nav.section.operations',
    items: [
      { to: '/admin/calendar', labelKey: 'admin.nav.calendar', icon: CalendarDays },
      { to: '/admin/policy', labelKey: 'admin.nav.policy', icon: Sliders },
      { to: '/admin/reports', labelKey: 'admin.nav.reports', icon: FileSpreadsheet },
      { to: '/admin/notifications', labelKey: 'admin.nav.notifications', icon: Bell },
      { to: '/admin/anomalies', labelKey: 'admin.nav.anomalies', icon: AlertTriangle },
    ],
  },
]

const FLAT_NAV: NavItem[] = NAV_GROUPS.flatMap((g) => g.items)

function from7DaysAgo(): string {
  return dateStrInKarachi(new Date(Date.now() - 7 * 86400000))
}

function navLinkClass({ isActive }: { isActive: boolean }) {
  return cn(
    'flex items-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition-colors',
    isActive
      ? 'bg-brand-50 text-brand-700 ring-1 ring-inset ring-brand-100'
      : 'text-stone-600 hover:bg-stone-100',
  )
}

function AnomalyBadge({ count }: { count: number }) {
  const { t } = useTranslation()
  return (
    <span
      aria-label={t('admin.anomaly.title')}
      className="ml-auto inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-status-late/15 px-1.5 py-0.5 font-mono text-[10px] font-semibold leading-none tabular-nums text-status-late ring-1 ring-inset ring-status-late/30"
    >
      {count}
    </span>
  )
}

export function AdminLayout() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const clearAuth = useAuthStore((s) => s.clearAuth)

  // Sidebar anomaly badge — cached for 60s in the queryClient so re-renders
  // across admin pages don't re-fetch.
  const anomalies = useAnomalyList(from7DaysAgo(), dateStrInKarachi())
  const anomalyCount = anomalies.data?.length ?? 0

  const onSignOut = () => {
    clearAuth()
    navigate('/login', { replace: true })
  }

  return (
    <div className="min-h-dvh bg-stone-50">
      <a
        href="#admin-main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded-md focus:bg-white focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:text-brand-700 focus:shadow-elev-2 focus:ring-2 focus:ring-brand-500"
      >
        {t('common.skipToContent')}
      </a>
      <header className="border-b border-stone-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-6 py-4">
          <div className="flex items-center gap-2.5">
            <div
              aria-hidden="true"
              className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-white shadow-elev-1"
            >
              <span className="font-display text-sm font-bold leading-none">F</span>
            </div>
            <p className="font-display text-base font-semibold tracking-tight text-stone-900">
              {t('app.name')}
            </p>
            <span aria-hidden="true" className="text-stone-300">
              ·
            </span>
            <p className="text-sm text-stone-500">{t('admin.role')}</p>
          </div>
          <div className="flex items-center gap-3">
            {user ? (
              <p className="hidden text-sm font-medium text-stone-900 sm:block">{user.fullName}</p>
            ) : null}
            <Button variant="ghost" size="sm" onClick={onSignOut}>
              {t('common.signOut')}
            </Button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-6 py-6 lg:grid lg:grid-cols-[200px_1fr] lg:gap-8">
        <nav aria-label={t('admin.dashboardTitle')} className="mb-4 lg:mb-0">
          {/* Mobile / tablet — flat horizontal scroll row (section labels would
              wrap awkwardly inside a single-line scroller). */}
          <ul className="flex gap-1 overflow-x-auto lg:hidden">
            {FLAT_NAV.map((item) => {
              const showBadge = item.to === '/admin/anomalies' && anomalyCount > 0
              return (
                <li key={item.to}>
                  <NavLink to={item.to} end={item.end} className={navLinkClass}>
                    <Icon icon={item.icon} size="sm" />
                    {t(item.labelKey)}
                    {showBadge ? <AnomalyBadge count={anomalyCount} /> : null}
                  </NavLink>
                </li>
              )
            })}
          </ul>

          {/* Desktop — grouped vertical sidebar. */}
          <div className="hidden lg:block">
            {NAV_GROUPS.map((group, gIdx) => (
              <div
                key={group.labelKey}
                className={cn('space-y-1', gIdx > 0 && 'mt-3 border-t border-stone-100 pt-3')}
              >
                <p className="px-3 pb-1 text-micro font-semibold uppercase text-stone-500">
                  {t(group.labelKey)}
                </p>
                <ul className="space-y-1">
                  {group.items.map((item) => {
                    const showBadge =
                      item.to === '/admin/anomalies' && anomalyCount > 0
                    return (
                      <li key={item.to}>
                        <NavLink to={item.to} end={item.end} className={navLinkClass}>
                          <Icon icon={item.icon} size="sm" />
                          {t(item.labelKey)}
                          {showBadge ? <AnomalyBadge count={anomalyCount} /> : null}
                        </NavLink>
                      </li>
                    )
                  })}
                </ul>
              </div>
            ))}
          </div>
        </nav>

        <main id="admin-main" className="min-w-0">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
