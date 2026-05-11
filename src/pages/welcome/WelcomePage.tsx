import { useTranslation } from 'react-i18next'

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

        <button
          type="button"
          onClick={toggleLanguage}
          aria-label={t('language.switchTo')}
          className="mt-6 inline-flex items-center justify-center rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2"
        >
          {t('language.switchTo')}
        </button>

        <p className="mt-8 text-xs text-slate-500">{t('app.tagline')}</p>
      </div>
    </main>
  )
}
