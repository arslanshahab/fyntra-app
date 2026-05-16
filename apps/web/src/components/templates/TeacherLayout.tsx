import { Calendar, History, type LucideIcon } from 'lucide-react'
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
  { to: '/teacher', labelKey: 'teacher.nav.today', icon: Calendar, end: true },
  { to: '/teacher/history', labelKey: 'teacher.nav.history', icon: History },
]

export function TeacherLayout() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const clearAuth = useAuthStore((s) => s.clearAuth)

  const onSignOut = () => {
    clearAuth()
    navigate('/login', { replace: true })
  }

  return (
    <div className="min-h-dvh bg-stone-50">
      <a
        href="#teacher-main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded-md focus:bg-white focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:text-brand-700 focus:shadow-elev-2 focus:ring-2 focus:ring-brand-500"
      >
        {t('common.skipToContent')}
      </a>
      <header className="border-b border-stone-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-4">
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
            <p className="text-sm text-stone-500">{t('teacher.role')}</p>
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

      <div className="mx-auto max-w-6xl px-6 py-6 lg:grid lg:grid-cols-[200px_1fr] lg:gap-8">
        <nav aria-label={t('teacher.role')} className="mb-4 lg:mb-0">
          <ul className="flex gap-1 overflow-x-auto lg:flex-col lg:space-y-1 lg:overflow-visible">
            {NAV.map((item) => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) =>
                    cn(
                      'flex items-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                      isActive
                        ? 'bg-brand-50 text-brand-700 ring-1 ring-inset ring-brand-100'
                        : 'text-stone-600 hover:bg-stone-100',
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

        <main id="teacher-main" className="min-w-0">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
