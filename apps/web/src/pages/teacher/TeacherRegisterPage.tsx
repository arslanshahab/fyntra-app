import { useState } from 'react'
import { CalendarRange, ChevronLeft, ChevronRight, UserX } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Icon } from '../../components/atoms/Icon'
import { StatusCard } from '../../components/molecules/StatusCard'
import { RegisterGrid } from '../../components/organisms/RegisterGrid'
import { useMeQuery } from '../../features/auth/queries'
import { useClassRegister } from '../../features/register/queries'

function currentMonth(): string {
  const d = new Date()
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number) as [number, number]
  const d = new Date(Date.UTC(y, m - 1 + delta, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

function monthLabel(month: string, locale: string): string {
  const [y, m] = month.split('-').map(Number) as [number, number]
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleString(locale, {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

export function TeacherRegisterPage() {
  const { t, i18n } = useTranslation()
  const me = useMeQuery()
  const klass = me.data?.assignedClass
  const [month, setMonth] = useState<string>(() => currentMonth())
  const register = useClassRegister(klass?.id, month)

  if (me.isLoading) {
    return (
      <div className="space-y-5" aria-busy="true" aria-label={t('common.loading')}>
        <div className="animate-pulse">
          <div className="h-7 w-48 rounded bg-stone-100" />
        </div>
      </div>
    )
  }

  if (!klass) {
    return <StatusCard icon={UserX} body={t('teacher.noClass')} />
  }

  return (
    <div className="space-y-5">
      <header className="flex items-baseline justify-between gap-2">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-stone-900">
            {t('teacher.register.pageTitle')}
          </h1>
          <p className="mt-0.5 text-sm text-stone-500">{klass.name}</p>
        </div>
      </header>

      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-label={t('teacher.register.prevMonth')}
          onClick={() => setMonth((m) => shiftMonth(m, -1))}
          className="inline-flex h-9 w-9 items-center justify-center rounded-full text-stone-600 ring-1 ring-inset ring-stone-200 transition-colors hover:bg-stone-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
        >
          <Icon icon={ChevronLeft} size="sm" />
        </button>
        <span className="font-mono text-lg font-semibold tabular-nums text-stone-900">
          {monthLabel(month, i18n.language)}
        </span>
        <button
          type="button"
          aria-label={t('teacher.register.nextMonth')}
          onClick={() => setMonth((m) => shiftMonth(m, 1))}
          className="inline-flex h-9 w-9 items-center justify-center rounded-full text-stone-600 ring-1 ring-inset ring-stone-200 transition-colors hover:bg-stone-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
        >
          <Icon icon={ChevronRight} size="sm" />
        </button>
      </div>

      {register.isLoading ? (
        <div
          aria-busy="true"
          aria-label={t('common.loading')}
          className="h-64 animate-pulse rounded-2xl bg-stone-100"
        />
      ) : register.isError ? (
        <p role="alert" className="rounded-lg bg-status-alarm/10 px-3 py-2 text-sm text-status-alarm ring-1 ring-status-alarm/20">
          {t('teacher.register.errors.load')}
        </p>
      ) : register.data && register.data.students.length === 0 ? (
        <StatusCard icon={CalendarRange} body={t('teacher.register.empty')} />
      ) : register.data ? (
        <RegisterGrid data={register.data} locale={i18n.language} />
      ) : null}
    </div>
  )
}
