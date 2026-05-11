import { useTranslation } from 'react-i18next'

import { Button } from '../../components/atoms/Button'

export function WelcomePage() {
  const { t, i18n } = useTranslation()
  const isUrdu = i18n.language.startsWith('ur')

  const toggleLanguage = () => {
    void i18n.changeLanguage(isUrdu ? 'en' : 'ur')
  }

  return (
    <main className="min-h-dvh flex items-center justify-center p-6 bg-slate-50">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-sm ring-1 ring-slate-200">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
          {t('app.name')}
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">
          {t('welcome.heading')}
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-slate-600">{t('welcome.body')}</p>

        <Button className="mt-6" onClick={toggleLanguage} aria-label={t('language.switchTo')}>
          {t('language.switchTo')}
        </Button>

        <p className="mt-8 text-xs text-slate-500">{t('app.tagline')}</p>
      </div>
    </main>
  )
}
