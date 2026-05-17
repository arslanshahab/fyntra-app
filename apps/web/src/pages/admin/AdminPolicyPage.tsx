import { useEffect, useMemo, useState } from 'react'
import { Sliders } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '../../components/atoms/Button'
import { Input } from '../../components/atoms/Input'
import { StatusCard } from '../../components/molecules/StatusCard'
import { useMeQuery } from '../../features/auth/queries'
import { usePatchSchool } from '../../features/schools/queries'
import { ApiError } from '../../services/api/client'
import { cn } from '../../utils/cn'
import type { School, Weekday } from '@fyntra/schemas'

const WEEKDAYS: Weekday[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']

const HHMM_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/

interface FormState {
  startTime: string
  endTime: string
  lateThresholdMinutes: string
  absentThresholdMinutes: string
  workingDays: Set<Weekday>
  halfDayCutoffTime: string // '' = clear / off
  academicYearStart: string // '' = clear
  academicYearEnd: string // '' = clear
}

function fromSchool(s: School): FormState {
  return {
    startTime: s.startTime,
    endTime: s.endTime,
    lateThresholdMinutes: String(s.lateThresholdMinutes),
    absentThresholdMinutes: String(s.absentThresholdMinutes),
    workingDays: new Set(s.workingDays),
    halfDayCutoffTime: s.halfDayCutoffTime ?? '',
    academicYearStart: s.academicYearStart ?? '',
    academicYearEnd: s.academicYearEnd ?? '',
  }
}

export function AdminPolicyPage() {
  const { t } = useTranslation()
  const me = useMeQuery()
  const patchMut = usePatchSchool()

  const [form, setForm] = useState<FormState | null>(null)
  // The post-save snapshot we diff against. Stays in lockstep with the form
  // so consecutive saves don't depend on the React Query refetch landing.
  const [baseline, setBaseline] = useState<FormState | null>(null)
  const [banner, setBanner] = useState<{ kind: 'success' | 'error'; text: string } | null>(null)

  // Seed the form once the school is loaded. The setStates are guarded by
  // `form === null` so they fire exactly once per mount — a controlled
  // initialization, not a render loop.
  useEffect(() => {
    if (me.data?.school && form === null) {
      const seeded = fromSchool(me.data.school)
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot seed from async data
      setForm(seeded)
      setBaseline(seeded)
    }
  }, [me.data?.school, form])

  const dirty = useMemo(() => {
    if (!form || !baseline) return false
    if (form.startTime !== baseline.startTime) return true
    if (form.endTime !== baseline.endTime) return true
    if (form.lateThresholdMinutes !== baseline.lateThresholdMinutes) return true
    if (form.absentThresholdMinutes !== baseline.absentThresholdMinutes) return true
    if (form.halfDayCutoffTime !== baseline.halfDayCutoffTime) return true
    if (form.academicYearStart !== baseline.academicYearStart) return true
    if (form.academicYearEnd !== baseline.academicYearEnd) return true
    if (form.workingDays.size !== baseline.workingDays.size) return true
    for (const w of form.workingDays) if (!baseline.workingDays.has(w)) return true
    return false
  }, [form, baseline])

  if (me.isLoading || !form) {
    return (
      <div className="space-y-5">
        <div aria-busy="true" aria-label={t('common.loading')} className="animate-pulse">
          <div className="h-7 w-40 rounded bg-stone-100" />
          <div className="mt-1.5 h-3.5 w-72 rounded bg-stone-100" />
        </div>
      </div>
    )
  }

  if (me.isError || !me.data) {
    return <StatusCard icon={Sliders} body={t('admin.policy.errors.load')} />
  }

  const toggleDay = (d: Weekday) => {
    setForm((f) => {
      if (!f) return f
      const next = new Set(f.workingDays)
      if (next.has(d)) next.delete(d)
      else next.add(d)
      return { ...f, workingDays: next }
    })
  }

  const validate = (): string | null => {
    if (!HHMM_REGEX.test(form.startTime)) return t('admin.policy.errors.timeInvalid', { field: t('admin.policy.fields.startTime') })
    if (!HHMM_REGEX.test(form.endTime)) return t('admin.policy.errors.timeInvalid', { field: t('admin.policy.fields.endTime') })
    if (form.startTime >= form.endTime) return t('admin.policy.errors.startAfterEnd')
    if (!/^\d+$/.test(form.lateThresholdMinutes)) return t('admin.policy.errors.numberInvalid')
    if (!/^\d+$/.test(form.absentThresholdMinutes)) return t('admin.policy.errors.numberInvalid')
    if (form.workingDays.size === 0) return t('admin.policy.errors.workingDaysEmpty')
    if (form.halfDayCutoffTime && !HHMM_REGEX.test(form.halfDayCutoffTime)) {
      return t('admin.policy.errors.timeInvalid', { field: t('admin.policy.fields.halfDayCutoffTime') })
    }
    if (form.academicYearStart && !DATE_REGEX.test(form.academicYearStart)) return t('admin.policy.errors.dateInvalid')
    if (form.academicYearEnd && !DATE_REGEX.test(form.academicYearEnd)) return t('admin.policy.errors.dateInvalid')
    if (form.academicYearStart && form.academicYearEnd && form.academicYearStart > form.academicYearEnd) {
      return t('admin.policy.errors.academicStartAfterEnd')
    }
    return null
  }

  const submit = () => {
    setBanner(null)
    const err = validate()
    if (err) {
      setBanner({ kind: 'error', text: err })
      return
    }
    // Send only the fields that changed — keeps the PATCH minimal and the
    // backend audit log clean (when we add one later).
    if (!baseline) return
    const b = baseline
    const patch: Parameters<typeof patchMut.mutate>[0] = {}
    if (form.startTime !== b.startTime) patch.startTime = form.startTime
    if (form.endTime !== b.endTime) patch.endTime = form.endTime
    if (form.lateThresholdMinutes !== b.lateThresholdMinutes) {
      patch.lateThresholdMinutes = Number(form.lateThresholdMinutes)
    }
    if (form.absentThresholdMinutes !== b.absentThresholdMinutes) {
      patch.absentThresholdMinutes = Number(form.absentThresholdMinutes)
    }
    // Working days — compare as sorted arrays.
    const baselineDays = [...b.workingDays].sort()
    const nextDays = [...form.workingDays].sort()
    if (baselineDays.join(',') !== nextDays.join(',')) patch.workingDays = nextDays
    // For nullable fields, '' on the form means "clear" — send `null`.
    if (form.halfDayCutoffTime !== b.halfDayCutoffTime) {
      patch.halfDayCutoffTime = form.halfDayCutoffTime === '' ? null : form.halfDayCutoffTime
    }
    if (form.academicYearStart !== b.academicYearStart) {
      patch.academicYearStart = form.academicYearStart === '' ? null : form.academicYearStart
    }
    if (form.academicYearEnd !== b.academicYearEnd) {
      patch.academicYearEnd = form.academicYearEnd === '' ? null : form.academicYearEnd
    }

    patchMut.mutate(patch, {
      onSuccess: (updated) => {
        const next = fromSchool(updated)
        setForm(next)
        setBaseline(next)
        setBanner({ kind: 'success', text: t('admin.policy.saveSuccess') })
      },
      onError: (e) => {
        const msg = e instanceof ApiError && e.status === 400
          ? t('admin.policy.errors.serverValidation')
          : t('admin.policy.errors.generic')
        setBanner({ kind: 'error', text: msg })
      },
    })
  }

  return (
    <div className="space-y-5">
      <header className="flex items-baseline justify-between gap-2">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-stone-900">
            {t('admin.policy.pageTitle')}
          </h1>
          <p className="mt-0.5 text-sm text-stone-500">{t('admin.policy.subtitle')}</p>
        </div>
      </header>

      {banner ? (
        <div
          role={banner.kind === 'error' ? 'alert' : 'status'}
          className={
            banner.kind === 'success'
              ? 'rounded-lg bg-status-present/10 px-3 py-2 text-sm text-status-present ring-1 ring-status-present/20'
              : 'rounded-lg bg-status-alarm/10 px-3 py-2 text-sm text-status-alarm ring-1 ring-status-alarm/20'
          }
        >
          {banner.text}
        </div>
      ) : null}

      <section className="rounded-2xl bg-white p-5 shadow-elev-1 ring-1 ring-stone-200">
        <h2 className="text-micro font-semibold uppercase tracking-wide text-stone-500">
          {t('admin.policy.section.dailyWindow')}
        </h2>
        <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="block text-sm font-medium text-stone-700">
            {t('admin.policy.fields.startTime')}
            <Input
              type="time"
              value={form.startTime}
              onChange={(e) => setForm((f) => (f ? { ...f, startTime: e.target.value } : f))}
              className="mt-1.5"
            />
          </label>
          <label className="block text-sm font-medium text-stone-700">
            {t('admin.policy.fields.endTime')}
            <Input
              type="time"
              value={form.endTime}
              onChange={(e) => setForm((f) => (f ? { ...f, endTime: e.target.value } : f))}
              className="mt-1.5"
            />
          </label>
          <label className="block text-sm font-medium text-stone-700">
            {t('admin.policy.fields.lateThresholdMinutes')}
            <Input
              type="number"
              min={0}
              max={180}
              value={form.lateThresholdMinutes}
              onChange={(e) => setForm((f) => (f ? { ...f, lateThresholdMinutes: e.target.value } : f))}
              className="mt-1.5"
            />
            <span className="mt-1.5 block text-xs text-stone-500">{t('admin.policy.fields.lateThresholdHelp')}</span>
          </label>
          <label className="block text-sm font-medium text-stone-700">
            {t('admin.policy.fields.absentThresholdMinutes')}
            <Input
              type="number"
              min={0}
              max={360}
              value={form.absentThresholdMinutes}
              onChange={(e) => setForm((f) => (f ? { ...f, absentThresholdMinutes: e.target.value } : f))}
              className="mt-1.5"
            />
            <span className="mt-1.5 block text-xs text-stone-500">{t('admin.policy.fields.absentThresholdHelp')}</span>
          </label>
        </div>
      </section>

      <section className="rounded-2xl bg-white p-5 shadow-elev-1 ring-1 ring-stone-200">
        <h2 className="text-micro font-semibold uppercase tracking-wide text-stone-500">
          {t('admin.policy.section.calendar')}
        </h2>
        <fieldset className="mt-3">
          <legend className="text-sm font-medium text-stone-700">{t('admin.policy.fields.workingDays')}</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {WEEKDAYS.map((d) => {
              const active = form.workingDays.has(d)
              return (
                <label
                  key={d}
                  className={cn(
                    'cursor-pointer rounded-full px-3 py-1.5 text-sm font-medium ring-1 ring-inset transition-colors focus-within:ring-2 focus-within:ring-brand-500',
                    active
                      ? 'bg-brand-50 text-brand-700 ring-brand-200'
                      : 'bg-white text-stone-600 ring-stone-200 hover:bg-stone-50',
                  )}
                >
                  <input
                    type="checkbox"
                    name={`workingDay-${d}`}
                    checked={active}
                    onChange={() => toggleDay(d)}
                    className="sr-only"
                  />
                  {t(`admin.policy.weekday.${d}`)}
                </label>
              )
            })}
          </div>
        </fieldset>

        <label className="mt-5 block text-sm font-medium text-stone-700">
          {t('admin.policy.fields.halfDayCutoffTime')}
          <Input
            type="time"
            value={form.halfDayCutoffTime}
            onChange={(e) => setForm((f) => (f ? { ...f, halfDayCutoffTime: e.target.value } : f))}
            className="mt-1.5"
          />
          <span className="mt-1.5 block text-xs text-stone-500">{t('admin.policy.fields.halfDayCutoffHelp')}</span>
        </label>

        <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="block text-sm font-medium text-stone-700">
            {t('admin.policy.fields.academicYearStart')}
            <Input
              type="date"
              value={form.academicYearStart}
              onChange={(e) => setForm((f) => (f ? { ...f, academicYearStart: e.target.value } : f))}
              className="mt-1.5"
            />
          </label>
          <label className="block text-sm font-medium text-stone-700">
            {t('admin.policy.fields.academicYearEnd')}
            <Input
              type="date"
              value={form.academicYearEnd}
              onChange={(e) => setForm((f) => (f ? { ...f, academicYearEnd: e.target.value } : f))}
              className="mt-1.5"
            />
          </label>
        </div>
      </section>

      <div className="flex justify-end">
        <Button onClick={submit} isLoading={patchMut.isPending} disabled={!dirty || patchMut.isPending}>
          {t('admin.policy.saveButton')}
        </Button>
      </div>
    </div>
  )
}
