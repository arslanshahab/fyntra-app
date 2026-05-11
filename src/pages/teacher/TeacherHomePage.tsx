import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'

import { Button } from '../../components/atoms/Button'
import { useAuthStore } from '../../stores/auth'

// Placeholder — step 9 replaces this with the real teacher view.
export function TeacherHomePage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const clearAuth = useAuthStore((s) => s.clearAuth)

  const onSignOut = () => {
    clearAuth()
    navigate('/login', { replace: true })
  }

  return (
    <main className="min-h-dvh flex items-center justify-center p-6 bg-slate-50">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-sm ring-1 ring-slate-200">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
          {t('app.name')}
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">
          {t('roleHome.teacher')}
        </h1>
        <p className="mt-2 text-sm text-slate-600">{user?.fullName ?? ''}</p>
        <p className="mt-6 text-sm text-slate-500">{t('roleHome.placeholder')}</p>
        <Button variant="secondary" className="mt-6 w-full" onClick={onSignOut}>
          {t('common.signOut')}
        </Button>
      </div>
    </main>
  )
}
