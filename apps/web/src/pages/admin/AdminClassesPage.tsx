import { useMemo, useState } from 'react'
import { Pencil, Trash2, Users } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '../../components/atoms/Button'
import { Icon } from '../../components/atoms/Icon'
import { Input } from '../../components/atoms/Input'
import { Modal } from '../../components/molecules/Modal'
import { StatusCard } from '../../components/molecules/StatusCard'
import {
  useClassesQuery,
  useCreateClass,
  useDeleteClass,
  usePatchClass,
} from '../../features/classes/queries'
import { useTeachersQuery } from '../../features/users/queries'
import { ApiError } from '../../services/api/client'
import type { Class } from '@fyntra/schemas'

type FormState = {
  name: string
  teacherId: string
}

const emptyForm: FormState = { name: '', teacherId: '' }

function fromClass(c: Class): FormState {
  return { name: c.name, teacherId: c.teacherId }
}

function RowSkeleton() {
  return (
    <tr aria-hidden="true" className="animate-pulse">
      <td className="px-4 py-3"><div className="h-3.5 w-28 rounded bg-stone-100" /></td>
      <td className="px-4 py-3"><div className="h-3.5 w-40 rounded bg-stone-100" /></td>
      <td className="px-4 py-3"><div className="h-3.5 w-10 rounded bg-stone-100" /></td>
      <td className="px-4 py-3"><div className="ml-auto h-7 w-20 rounded-md bg-stone-100" /></td>
    </tr>
  )
}

function errorKeyFromApi(err: unknown): string {
  if (err instanceof ApiError) {
    const body = err.body as { code?: string } | undefined
    switch (body?.code) {
      case 'CLASS_NAME_TAKEN':
        return 'admin.classes.errors.classNameTaken'
      case 'TEACHER_ALREADY_ASSIGNED':
        return 'admin.classes.errors.teacherAlreadyAssigned'
      case 'TEACHER_NOT_ELIGIBLE':
        return 'admin.classes.errors.teacherNotEligible'
      case 'CLASS_HAS_STUDENTS':
        return 'admin.classes.errors.classHasStudents'
      default:
        return 'admin.classes.errors.generic'
    }
  }
  return 'admin.classes.errors.generic'
}

export function AdminClassesPage() {
  const { t } = useTranslation()
  const classes = useClassesQuery()
  const teachers = useTeachersQuery()
  const createMut = useCreateClass()
  const patchMut = usePatchClass()
  const deleteMut = useDeleteClass()

  const [form, setForm] = useState<FormState>(emptyForm)
  const [editing, setEditing] = useState<Class | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [banner, setBanner] = useState<{ kind: 'success' | 'error'; text: string } | null>(null)

  const classList = useMemo(
    () => [...(classes.data ?? [])].sort((a, b) => a.name.localeCompare(b.name)),
    [classes.data],
  )

  const teacherToClass = useMemo(() => {
    const map = new Map<string, Class>()
    for (const c of classList) map.set(c.teacherId, c)
    return map
  }, [classList])

  const teacherName = (id: string) =>
    teachers.data?.find((u) => u.id === id)?.fullName ?? t('admin.classes.row.unassigned')

  const deleting = useMemo(
    () => (deletingId ? classList.find((c) => c.id === deletingId) ?? null : null),
    [deletingId, classList],
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

  const openEdit = (c: Class) => {
    setForm(fromClass(c))
    setEditing(c)
    setShowForm(true)
    setBanner(null)
  }

  const isDirty =
    !editing ||
    form.name.trim() !== editing.name ||
    form.teacherId !== editing.teacherId

  const isValid =
    form.name.trim().length > 0 && form.teacherId.length > 0

  const submit = () => {
    setBanner(null)
    if (!isValid || !isDirty) return
    const payload = { name: form.name.trim(), teacherId: form.teacherId }
    if (editing) {
      patchMut.mutate(
        { id: editing.id, patch: payload },
        {
          onSuccess: () => {
            setBanner({ kind: 'success', text: t('admin.classes.editSuccess') })
            closeForm()
          },
          onError: (err) => setBanner({ kind: 'error', text: t(errorKeyFromApi(err)) }),
        },
      )
    } else {
      createMut.mutate(payload, {
        onSuccess: () => {
          setBanner({ kind: 'success', text: t('admin.classes.createSuccess') })
          closeForm()
        },
        onError: (err) => setBanner({ kind: 'error', text: t(errorKeyFromApi(err)) }),
      })
    }
  }

  const confirmDelete = () => {
    if (!deletingId) return
    deleteMut.mutate(deletingId, {
      onSuccess: () => {
        setBanner({ kind: 'success', text: t('admin.classes.deleteSuccess') })
        setDeletingId(null)
      },
      onError: (err) => setBanner({ kind: 'error', text: t(errorKeyFromApi(err)) }),
    })
  }

  const pending = createMut.isPending || patchMut.isPending

  return (
    <div className="space-y-5">
      <header className="flex items-baseline justify-between gap-2">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-stone-900">
            {t('admin.classes.title')}
          </h1>
          <p className="mt-0.5 text-sm text-stone-500">{t('admin.classes.subtitle')}</p>
        </div>
        <Button onClick={openCreate} size="sm">
          {t('admin.classes.addCta')}
        </Button>
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

      {classes.isError ? (
        <StatusCard
          tone="alarm"
          icon={Users}
          body={t('admin.classes.loadError')}
          action={{ label: t('common.retry'), onClick: () => void classes.refetch() }}
        />
      ) : !classes.isLoading && classList.length === 0 ? (
        <StatusCard icon={Users} body={t('admin.classes.empty')} />
      ) : (
        <div className="overflow-hidden rounded-2xl bg-white shadow-elev-1 ring-1 ring-stone-200">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-stone-200 text-sm">
              <thead className="bg-stone-50 text-micro uppercase text-stone-500">
                <tr>
                  <th scope="col" className="px-4 py-3 text-left font-semibold">{t('admin.classes.columns.name')}</th>
                  <th scope="col" className="px-4 py-3 text-left font-semibold">{t('admin.classes.columns.teacher')}</th>
                  <th scope="col" className="px-4 py-3 text-left font-semibold">{t('admin.classes.columns.students')}</th>
                  <th scope="col" className="px-4 py-3 text-right font-semibold">{t('admin.classes.columns.actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {classes.isLoading
                  ? Array.from({ length: 3 }).map((_, i) => <RowSkeleton key={i} />)
                  : classList.map((c) => (
                    <tr key={c.id} className="transition-colors hover:bg-stone-50">
                      <td className="px-4 py-3 font-medium text-stone-900">{c.name}</td>
                      <td className="px-4 py-3 text-stone-700">{teacherName(c.teacherId)}</td>
                      <td className="px-4 py-3 font-mono tabular-nums text-stone-700">{c.studentCount ?? 0}</td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-1">
                          <button
                            type="button"
                            aria-label={t('admin.classes.row.edit')}
                            onClick={() => openEdit(c)}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-stone-500 transition-colors hover:bg-stone-100 hover:text-stone-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                          >
                            <Icon icon={Pencil} size="sm" />
                          </button>
                          <button
                            type="button"
                            aria-label={t('admin.classes.row.delete')}
                            onClick={() => setDeletingId(c.id)}
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
        <Modal label={editing ? t('admin.classes.form.editTitle') : t('admin.classes.form.createTitle')}>
          <h2 className="font-display text-lg font-semibold tracking-tight text-stone-900">
            {editing ? t('admin.classes.form.editTitle') : t('admin.classes.form.createTitle')}
          </h2>

          <label className="mt-5 block text-sm font-medium text-stone-700">
            {t('admin.classes.form.nameLabel')}
            <Input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              maxLength={60}
              placeholder={t('admin.classes.form.namePlaceholder')}
              className="mt-1.5"
            />
          </label>

          <label className="mt-4 block text-sm font-medium text-stone-700">
            {t('admin.classes.form.teacherLabel')}
            <select
              value={form.teacherId}
              onChange={(e) => setForm((f) => ({ ...f, teacherId: e.target.value }))}
              className="mt-1.5 h-11 w-full rounded-lg border border-stone-300 bg-white px-3 text-sm text-stone-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
            >
              <option value="" disabled>{t('admin.classes.form.teacherPlaceholder')}</option>
              {(teachers.data ?? []).map((u) => {
                const conflicting = teacherToClass.get(u.id)
                const conflictsWithAnother = conflicting && conflicting.id !== editing?.id
                return (
                  <option
                    key={u.id}
                    value={u.id}
                    disabled={conflictsWithAnother || false}
                  >
                    {u.fullName}
                    {conflictsWithAnother
                      ? ` ${t('admin.classes.form.teacherUnavailableSuffix', { className: conflicting!.name })}`
                      : ''}
                  </option>
                )
              })}
            </select>
            {(teachers.data?.length ?? 0) === 0 ? (
              <span className="mt-1.5 block text-xs text-stone-500">{t('admin.classes.form.noTeachersHint')}</span>
            ) : null}
          </label>

          <div className="mt-6 flex justify-end gap-2">
            <Button variant="ghost" onClick={closeForm}>{t('common.cancel')}</Button>
            <Button
              onClick={submit}
              isLoading={pending}
              disabled={pending || !isValid || !isDirty}
            >
              {editing ? t('admin.classes.form.submitSave') : t('admin.classes.form.submitCreate')}
            </Button>
          </div>
        </Modal>
      ) : null}

      {deletingId && deleting ? (
        <Modal label={t('admin.classes.delete.title', { name: deleting.name })}>
          <h2 className="font-display text-lg font-semibold tracking-tight text-stone-900">
            {t('admin.classes.delete.title', { name: deleting.name })}
          </h2>
          <p className="mt-2 text-sm text-stone-600">
            {(deleting.studentCount ?? 0) > 0
              ? t('admin.classes.delete.bodyHasStudents', { count: deleting.studentCount ?? 0 })
              : t('admin.classes.delete.bodyEmpty')}
          </p>
          <div className="mt-6 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setDeletingId(null)}>{t('common.cancel')}</Button>
            <Button
              onClick={confirmDelete}
              isLoading={deleteMut.isPending}
              disabled={deleteMut.isPending || (deleting.studentCount ?? 0) > 0}
            >
              {t('admin.classes.delete.submit')}
            </Button>
          </div>
        </Modal>
      ) : null}
    </div>
  )
}
