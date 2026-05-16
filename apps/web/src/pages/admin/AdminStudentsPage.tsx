import { useState } from 'react'
import { AlertTriangle, Users } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'

import { Avatar } from '../../components/atoms/Avatar'
import { Badge } from '../../components/atoms/Badge'
import { SearchBar } from '../../components/molecules/SearchBar'
import { StatusCard } from '../../components/molecules/StatusCard'
import { useClassesQuery } from '../../features/classes/queries'
import { useStudentsQuery } from '../../features/students/queries'
import { useDebounce } from '../../hooks/useDebounce'

function StudentRowSkeleton() {
  return (
    <tr aria-hidden="true" className="animate-pulse">
      <td className="px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-full bg-stone-100" />
          <div className="space-y-1.5">
            <div className="h-3.5 w-36 rounded bg-stone-100" />
            <div className="h-3 w-20 rounded bg-stone-100" />
          </div>
        </div>
      </td>
      <td className="hidden px-4 py-3 md:table-cell">
        <div className="h-3.5 w-24 rounded bg-stone-100" />
      </td>
      <td className="px-4 py-3">
        <div className="h-5 w-16 rounded-full bg-stone-100" />
      </td>
    </tr>
  )
}

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
    <div className="space-y-5">
      <header className="flex items-baseline justify-between gap-2">
        <h1 className="font-display text-2xl font-semibold tracking-tight text-stone-900">
          {t('admin.students.title')}
        </h1>
        {students.data ? (
          <span className="font-mono text-sm tabular-nums text-stone-500">
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
          className="h-11 rounded-lg border border-stone-300 bg-white px-3 text-sm text-stone-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 sm:w-56"
        >
          <option value="">{t('admin.students.allClasses')}</option>
          {(classes.data ?? []).map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      {students.isError ? (
        <StatusCard
          tone="alarm"
          icon={AlertTriangle}
          body={t('admin.students.loadError')}
          action={{ label: t('common.retry'), onClick: () => void students.refetch() }}
        />
      ) : !students.isLoading && (!students.data || students.data.length === 0) ? (
        <StatusCard icon={Users} body={t('admin.students.empty')} />
      ) : (
        <div className="overflow-hidden rounded-2xl bg-white shadow-elev-1 ring-1 ring-stone-200">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-stone-200 text-sm">
              <thead className="bg-stone-50 text-micro uppercase text-stone-500">
                <tr>
                  <th scope="col" className="px-4 py-3 text-left font-semibold">
                    {t('admin.students.table.name')}
                  </th>
                  <th
                    scope="col"
                    className="hidden px-4 py-3 text-left font-semibold md:table-cell"
                  >
                    {t('admin.students.table.class')}
                  </th>
                  <th scope="col" className="px-4 py-3 text-left font-semibold">
                    {t('admin.students.table.card')}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {students.isLoading
                  ? Array.from({ length: 6 }).map((_, i) => <StudentRowSkeleton key={i} />)
                  : (students.data ?? []).map((student) => (
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
                        className="cursor-pointer transition-colors hover:bg-stone-50 focus:bg-stone-50 focus:outline-none"
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <Avatar name={student.fullName} src={student.photoUrl} size="sm" />
                            <div className="min-w-0">
                              <p className="truncate font-medium text-stone-900">
                                {student.fullName}
                              </p>
                              <p className="font-mono text-xs text-stone-500">
                                {student.rollNumber}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="hidden px-4 py-3 text-stone-700 md:table-cell">
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
          </div>
        </div>
      )}
    </div>
  )
}
