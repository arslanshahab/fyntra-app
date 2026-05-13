import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'

import { Avatar } from '../../components/atoms/Avatar'
import { Badge } from '../../components/atoms/Badge'
import { Spinner } from '../../components/atoms/Spinner'
import { SearchBar } from '../../components/molecules/SearchBar'
import { useClassesQuery } from '../../features/classes/queries'
import { useStudentsQuery } from '../../features/students/queries'
import { useDebounce } from '../../hooks/useDebounce'

export function AdminStudentsPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const classes = useClassesQuery()

  const [search, setSearch] = useState('')
  const [classId, setClassId] = useState<string>('')
  const debouncedSearch = useDebounce(search, 250)

  const students = useStudentsQuery({
    classId: classId || undefined,
    search: debouncedSearch || undefined,
  })

  const classesById = new Map((classes.data ?? []).map((c) => [c.id, c]))

  return (
    <div className="space-y-4">
      <header className="flex items-baseline justify-between gap-2">
        <h1 className="text-xl font-semibold text-slate-900">{t('admin.students.title')}</h1>
        {students.data ? (
          <span className="text-sm text-slate-500">
            {t('admin.students.count', { count: students.data.length })}
          </span>
        ) : null}
      </header>

      <div className="flex flex-col gap-3 sm:flex-row">
        <SearchBar
          className="sm:flex-1"
          value={search}
          onChange={setSearch}
          placeholder={t('admin.students.searchPlaceholder')}
          ariaLabel={t('admin.students.searchPlaceholder')}
        />
        <select
          value={classId}
          onChange={(e) => setClassId(e.target.value)}
          aria-label={t('admin.students.filterByClass')}
          className="h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 sm:w-56"
        >
          <option value="">{t('admin.students.allClasses')}</option>
          {(classes.data ?? []).map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
        {students.isLoading ? (
          <div role="status" aria-label={t('common.loading')} className="p-12 text-center">
            <Spinner />
          </div>
        ) : students.isError ? (
          <p role="alert" className="p-5 text-sm text-status-alarm">
            {t('admin.students.loadError')}
          </p>
        ) : !students.data || students.data.length === 0 ? (
          <p className="p-8 text-center text-sm text-slate-500">{t('admin.students.empty')}</p>
        ) : (
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th scope="col" className="px-4 py-3 text-left font-medium">
                  {t('admin.students.table.name')}
                </th>
                <th scope="col" className="hidden px-4 py-3 text-left font-medium md:table-cell">
                  {t('admin.students.table.class')}
                </th>
                <th scope="col" className="px-4 py-3 text-left font-medium">
                  {t('admin.students.table.card')}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {students.data.map((student) => (
                <tr
                  key={student.id}
                  tabIndex={0}
                  onClick={() => navigate(`/admin/students/${student.id}`)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      navigate(`/admin/students/${student.id}`)
                    }
                  }}
                  className="cursor-pointer hover:bg-slate-50 focus:bg-slate-50 focus:outline-none"
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <Avatar name={student.fullName} src={student.photoUrl} size="sm" />
                      <div className="min-w-0">
                        <p className="truncate font-medium text-slate-900">{student.fullName}</p>
                        <p className="text-xs text-slate-500">{student.rollNumber}</p>
                      </div>
                    </div>
                  </td>
                  <td className="hidden px-4 py-3 text-slate-700 md:table-cell">
                    {classesById.get(student.classId)?.name ?? student.classId}
                  </td>
                  <td className="px-4 py-3">
                    {student.cardId ? (
                      <Badge tone="present">{t('admin.cards.status.active')}</Badge>
                    ) : (
                      <Badge tone="notyet">{t('admin.students.table.noCard')}</Badge>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
