import { useEffect, type ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { I18nextProvider, useTranslation } from 'react-i18next'
import { BrowserRouter } from 'react-router-dom'

import i18n, { localeDirection, type Locale } from '../i18n'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: true,
      staleTime: 30_000,
    },
  },
})

// Mirrors the active i18n locale onto <html lang> and <html dir> so RTL and
// the Urdu webfont (see src/index.css) react to language changes. Kept here
// rather than in main.tsx so it stays inside React's lifecycle.
function LocaleDocumentSync() {
  const { i18n: i18nInstance } = useTranslation()

  useEffect(() => {
    const apply = (rawLng: string | undefined) => {
      const tag = (rawLng?.split('-')[0] ?? 'en') as Locale
      const dir = localeDirection[tag] ?? 'ltr'
      document.documentElement.lang = tag
      document.documentElement.dir = dir
    }

    apply(i18nInstance.language)
    i18nInstance.on('languageChanged', apply)
    return () => {
      i18nInstance.off('languageChanged', apply)
    }
  }, [i18nInstance])

  return null
}

interface ProvidersProps {
  children: ReactNode
}

export function Providers({ children }: ProvidersProps) {
  return (
    <QueryClientProvider client={queryClient}>
      <I18nextProvider i18n={i18n}>
        <BrowserRouter>
          <LocaleDocumentSync />
          {children}
          {import.meta.env.DEV ? <ReactQueryDevtools initialIsOpen={false} /> : null}
        </BrowserRouter>
      </I18nextProvider>
    </QueryClientProvider>
  )
}
