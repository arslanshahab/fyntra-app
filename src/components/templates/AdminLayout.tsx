import { CreditCard, Home, type LucideIcon, Radio, Users } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'

import { Button } from '../atoms/Button'
import { Icon } from '../atoms/Icon'
import { useAuthStore } from '../../stores/auth'
import { cn } from '../../utils/cn'

interface NavItem {
  to: string
  labelKey: string
  icon: LucideIcon
  end?: boolean
}

const NAV: NavItem[] = [
  { to: '/admin', labelKey: 'admin.nav.dashboard', icon: Home, end: true },
  { to: '/admin/students', labelKey: 'admin.nav.students', icon: Users },
  { to: '/admin/cards', labelKey: 'admin.nav.cards', icon: CreditCard },
  { to: '/admin/devices', labelKey: 'admin.nav.devices', icon: Radio },
]

export function AdminLayout() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const clearAuth = useAuthStore((s) => s.clearAuth)

  const onSignOut = () => {
    clearAuth()
    navigate('/login', { replace: true })
  }

  return (
    <div className="min-h-dvh bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-6 py-4">
          <div>
            <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500">
              {t('app.name')} · {t('admin.dashboardTitle')}
            </p>
            <p className="text-sm font-medium text-slate-900">{user ? user.fullName : ''}</p>
          </div>
          <Button variant="ghost" size="sm" onClick={onSignOut}>
            {t('common.signOut')}
          </Button>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-6 py-6 lg:grid lg:grid-cols-[200px_1fr] lg:gap-8">
        <nav aria-label={t('admin.dashboardTitle')} className="mb-4 lg:mb-0">
          <ul className="flex gap-1 overflow-x-auto lg:flex-col lg:space-y-1 lg:overflow-visible">
            {NAV.map((item) => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) =>
                    cn(
                      'flex items-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium',
                      isActive
                        ? 'bg-brand-50 text-brand-700 ring-1 ring-inset ring-brand-100'
                        : 'text-slate-600 hover:bg-slate-100',
                    )
                  }
                >
                  <Icon icon={item.icon} size="sm" />
                  {t(item.labelKey)}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>

        <div className="min-w-0">
          <Outlet />
        </div>
      </div>
    </div>
  )
}
