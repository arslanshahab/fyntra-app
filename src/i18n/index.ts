import i18n from 'i18next'
import LanguageDetector from 'i18next-browser-languagedetector'
import { initReactI18next } from 'react-i18next'

import enCommon from './locales/en.json'
import urCommon from './locales/ur.json'

export const supportedLocales = ['en', 'ur'] as const
export type Locale = (typeof supportedLocales)[number]

export const localeDirection: Record<Locale, 'ltr' | 'rtl'> = {
  en: 'ltr',
  ur: 'rtl',
}

const envDefault = import.meta.env.VITE_DEFAULT_LOCALE as Locale | undefined
const fallbackLng: Locale = envDefault && supportedLocales.includes(envDefault) ? envDefault : 'en'

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    fallbackLng,
    supportedLngs: [...supportedLocales],
    nonExplicitSupportedLngs: true,
    interpolation: { escapeValue: false },
    resources: {
      en: { common: enCommon },
      ur: { common: urCommon },
    },
    ns: ['common'],
    defaultNS: 'common',
    detection: {
      order: ['localStorage', 'navigator'],
      caches: ['localStorage'],
      lookupLocalStorage: 'fyntra:locale',
    },
  })

export default i18n
