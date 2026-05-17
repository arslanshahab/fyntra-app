import { useMemo, useState } from 'react'
import { CalendarDays, ChevronLeft, ChevronRight, Pencil, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Badge } from '../../components/atoms/Badge'
import { Button } from '../../components/atoms/Button'
import { Icon } from '../../components/atoms/Icon'
import { Input } from '../../components/atoms/Input'
import { Modal } from '../../components/molecules/Modal'
import { StatusCard } from '../../components/molecules/StatusCard'
import {
  useCreateHoliday,
  useDeleteHoliday,
  useHolidaysByYear,
  usePatchHoliday,
} from '../../features/holidays/queries'
import { ApiError } from '../../services/api/client'
import { cn } from '../../utils/cn'
import type { Holiday, HolidayKind } from '@fyntra/schemas'

const KINDS: HolidayKind[] = ['closed', 'exam', 'half_day']

// Distinct tones so the year list reads at a glance: red = closed, purple
// = exam (no record), amber = half-day. Mirrors the eventual register
// letter colours we'll use in PR 4.
const kindToneMap: Record<HolidayKind, 'absent' | 'unverified' | 'late'> = {
  closed: 'absent',
  exam: 'unverified',
  half_day: 'late',
}

type FormState = {
  date: string
  label: string
  kind: HolidayKind
  effectiveEndTime: string
}

const emptyForm: FormState = { date: '', label: '', kind: 'closed', effectiveEndTime: '' }

function fromHoliday(h: Holiday): FormState {
  return {
    date: h.date,
    label: h.label,
    kind: h.kind,
    effectiveEndTime: h.effectiveEndTime ?? '',
  }
}

function currentYear(): number {
  return new Date().getFullYear()
}

function RowSkeleton() {
  return (
    <tr aria-hidden="true" className="animate-pulse">
      <td className="px-4 py-3"><div className="h-3.5 w-24 rounded bg-stone-100" /></td>
      <td className="px-4 py-3"><div className="h-3.5 w-40 rounded bg-stone-100" /></td>
      <td className="px-4 py-3"><div className="h-5 w-16 rounded-full bg-stone-100" /></td>
      <td className="px-4 py-3"><div className="ml-auto h-7 w-20 rounded-md bg-stone-100" /></td>
    </tr>
  )
}

export function AdminCalendarPage() {
  const { t } = useTranslation()
  const [year, setYear] = useState(() => currentYear())
  const holidays = useHolidaysByYear(year)
  const createMut = useCreateHoliday()
  const patchMut = usePatchHoliday()
  const deleteMut = useDeleteHoliday()

  const [form, setForm] = useState<FormState>(emptyForm)
  const [editing, setEditing] = useState<Holiday | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [banner, setBanner] = useState<{ kind: 'success' | 'error'; text: string } | null>(null)

  const deleting = useMemo(
    () => (deletingId ? holidays.data?.find((h) => h.id === deletingId) ?? null : null),
    [deletingId, holidays.data],
  )

  const closeForm = () => {
    setShowForm(false)
    setEditing(null)
    setForm(emptyForm)
  }

  const openCreate = () => {
    setForm(emptyForm)
    setEditing(null)
    setShowForm(true)
    setBanner(null)
  }

  const openEdit = (h: Holiday) => {
    setForm(fromHoliday(h))
    setEditing(h)
    setShowForm(true)
    setBanner(null)
  }

  const handleApiError = (err: unknown, fallbackKey: string) => {
    if (err instanceof ApiError && err.status === 409) {
      setBanner({ kind: 'error', text: t('admin.calendar.errors.conflict') })
      return
    }
    if (err instanceof ApiError && err.status === 400) {
      setBanner({ kind: 'error', text: t('admin.calendar.errors.invalid') })
      return
    }
    setBanner({ kind: 'error', text: t(fallbackKey) })
  }

  const validate = (): boolean => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(form.date)) {
      setBanner({ kind: 'error', text: t('admin.calendar.errors.invalid') })
      return false
    }
    if (form.label.trim().length === 0) {
      setBanner({ kind: 'error', text: t('admin.calendar.errors.invalid') })
      return false
    }
    if (form.kind === 'half_day' && !/^([01]\d|2[0-3]):[0-5]\d$/.test(form.effectiveEndTime)) {
      setBanner({ kind: 'error', text: t('admin.calendar.errors.endTimeRequired') })
      return false
    }
    return true
  }

  const submit = () => {
    setBanner(null)
    if (!validate()) return
    const payload = {
      date: form.date,
      label: form.label.trim(),
      kind: form.kind,
      effectiveEndTime: form.kind === 'half_day' ? form.effectiveEndTime : undefined,
    }
    if (editing) {
      patchMut.mutate(
        { id: editing.id, patch: payload },
        {
          onSuccess: () => {
            setBanner({ kind: 'success', text: t('admin.calendar.editSuccess') })
            closeForm()
          },
          onError: (err) => handleApiError(err, 'admin.calendar.errors.generic'),
        },
      )
    } else {
      createMut.mutate(payload, {
        onSuccess: () => {
          setBanner({ kind: 'success', text: t('admin.calendar.createSuccess') })
          closeForm()
        },
        onError: (err) => handleApiError(err, 'admin.calendar.errors.generic'),
      })
    }
  }

  const confirmDelete = () => {
    if (!deletingId) return
    deleteMut.mutate(deletingId, {
      onSuccess: () => {
        setBanner({ kind: 'success', text: t('admin.calendar.deleteSuccess') })
        setDeletingId(null)
      },
      onError: () => setBanner({ kind: 'error', text: t('admin.calendar.errors.generic') }),
    })
  }

  const pending = createMut.isPending || patchMut.isPending

  return (
    <div className="space-y-5">
      <header className="flex items-baseline justify-between gap-2">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-stone-900">
            {t('admin.calendar.pageTitle')}
          </h1>
          <p className="mt-0.5 text-sm text-stone-500">{t('admin.calendar.subtitle')}</p>
        </div>
        <Button onClick={openCreate} size="sm">
          {t('admin.calendar.newButton')}
        </Button>
      </header>

      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-label={t('admin.calendar.prevYear')}
          onClick={() => setYear((y) => y - 1)}
          className="inline-flex h-9 w-9 items-center justify-center rounded-full text-stone-600 ring-1 ring-inset ring-stone-200 transition-colors hover:bg-stone-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
        >
          <Icon icon={ChevronLeft} size="sm" />
        </button>
        <span className="font-mono text-lg font-semibold tabular-nums text-stone-900">{year}</span>
        <button
          type="button"
          aria-label={t('admin.calendar.nextYear')}
          onClick={() => setYear((y) => y + 1)}
          className="inline-flex h-9 w-9 items-center justify-center rounded-full text-stone-600 ring-1 ring-inset ring-stone-200 transition-colors hover:bg-stone-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
        >
          <Icon icon={ChevronRight} size="sm" />
        </button>
      </div>

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

      {holidays.isError ? (
        <p role="alert" className="rounded-lg bg-status-alarm/10 px-3 py-2 text-sm text-status-alarm ring-1 ring-status-alarm/20">
          {t('admin.calendar.errors.load')}
        </p>
      ) : null}

      {!holidays.isLoading && (!holidays.data || holidays.data.length === 0) ? (
        <StatusCard icon={CalendarDays} body={t('admin.calendar.empty', { year })} />
      ) : (
        <div className="overflow-hidden rounded-2xl bg-white shadow-elev-1 ring-1 ring-stone-200">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-stone-200 text-sm">
              <thead className="bg-stone-50 text-micro uppercase text-stone-500">
                <tr>
                  <th scope="col" className="px-4 py-3 text-left font-semibold">{t('admin.calendar.dateHeader')}</th>
                  <th scope="col" className="px-4 py-3 text-left font-semibold">{t('admin.calendar.labelHeader')}</th>
                  <th scope="col" className="px-4 py-3 text-left font-semibold">{t('admin.calendar.kindHeader')}</th>
                  <th scope="col" className="px-4 py-3 text-right font-semibold">{t('admin.calendar.actionsHeader')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {holidays.isLoading
                  ? Array.from({ length: 4 }).map((_, i) => <RowSkeleton key={i} />)
                  : (holidays.data ?? []).map((h) => (
                    <tr key={h.id} className="transition-colors hover:bg-stone-50">
                      <td className="px-4 py-3 font-mono tabular-nums text-stone-700">{h.date}</td>
                      <td className="px-4 py-3 text-stone-900">{h.label}</td>
                      <td className="px-4 py-3">
                        <Badge tone={kindToneMap[h.kind]}>
                          {t(`admin.calendar.kind.${h.kind}`)}
                          {h.kind === 'half_day' && h.effectiveEndTime ? ` · ${h.effectiveEndTime}` : ''}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-1">
                          <button
                            type="button"
                            aria-label={t('admin.calendar.editAction')}
                            onClick={() => openEdit(h)}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-stone-500 transition-colors hover:bg-stone-100 hover:text-stone-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                          >
                            <Icon icon={Pencil} size="sm" />
                          </button>
                          <button
                            type="button"
                            aria-label={t('admin.calendar.deleteAction')}
                            onClick={() => setDeletingId(h.id)}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-stone-500 transition-colors hover:bg-status-alarm/10 hover:text-status-alarm focus:outline-none focus-visible:ring-2 focus-visible:ring-status-alarm"
                          >
                            <Icon icon={Trash2} size="sm" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showForm ? (
        <Modal label={editing ? t('admin.calendar.form.editTitle') : t('admin.calendar.form.createTitle')}>
          <h2 className="font-display text-lg font-semibold tracking-tight text-stone-900">
            {editing ? t('admin.calendar.form.editTitle') : t('admin.calendar.form.createTitle')}
          </h2>

          <label className="mt-5 block text-sm font-medium text-stone-700">
            {t('admin.calendar.form.dateLabel')}
            <Input
              type="date"
              value={form.date}
              onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
              className="mt-1.5"
            />
          </label>

          <label className="mt-4 block text-sm font-medium text-stone-700">
            {t('admin.calendar.form.labelLabel')}
            <Input
              value={form.label}
              onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
              maxLength={120}
              placeholder={t('admin.calendar.form.labelPlaceholder')}
              className="mt-1.5"
            />
          </label>

          <fieldset className="mt-4">
            <legend className="text-sm font-medium text-stone-700">{t('admin.calendar.form.kindLabel')}</legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {KINDS.map((k) => (
                <label
                  key={k}
                  className={cn(
                    'cursor-pointer rounded-full px-3 py-1.5 text-sm font-medium ring-1 ring-inset transition-colors focus-within:ring-2 focus-within:ring-brand-500',
                    form.kind === k
                      ? 'bg-brand-50 text-brand-700 ring-brand-200'
                      : 'bg-white text-stone-600 ring-stone-200 hover:bg-stone-50',
                  )}
                >
                  <input
                    type="radio"
                    name="holiday-kind"
                    value={k}
                    checked={form.kind === k}
                    onChange={() => setForm((f) => ({ ...f, kind: k }))}
                    className="sr-only"
                  />
                  {t(`admin.calendar.kind.${k}`)}
                </label>
              ))}
            </div>
          </fieldset>

          {form.kind === 'half_day' ? (
            <label className="mt-4 block text-sm font-medium text-stone-700">
              {t('admin.calendar.form.endTimeLabel')}
              <Input
                type="time"
                value={form.effectiveEndTime}
                onChange={(e) => setForm((f) => ({ ...f, effectiveEndTime: e.target.value }))}
                className="mt-1.5"
              />
              <span className="mt-1.5 block text-xs text-stone-500">{t('admin.calendar.form.endTimeHelp')}</span>
            </label>
          ) : null}

          <div className="mt-6 flex justify-end gap-2">
            <Button variant="ghost" onClick={closeForm}>{t('common.cancel')}</Button>
            <Button onClick={submit} isLoading={pending} disabled={pending}>
              {editing ? t('admin.calendar.form.saveSubmit') : t('admin.calendar.form.createSubmit')}
            </Button>
          </div>
        </Modal>
      ) : null}

      {deletingId && deleting ? (
        <Modal label={t('admin.calendar.delete.title')}>
          <h2 className="font-display text-lg font-semibold tracking-tight text-stone-900">
            {t('admin.calendar.delete.title')}
          </h2>
          <p className="mt-2 text-sm text-stone-600">
            {t('admin.calendar.delete.confirmBody', { label: deleting.label, date: deleting.date })}
          </p>
          <div className="mt-6 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setDeletingId(null)}>{t('common.cancel')}</Button>
            <Button onClick={confirmDelete} isLoading={deleteMut.isPending} disabled={deleteMut.isPending}>
              {t('admin.calendar.delete.submit')}
            </Button>
          </div>
        </Modal>
      ) : null}
    </div>
  )
}
