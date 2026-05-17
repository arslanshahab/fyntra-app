import { useMemo } from 'react'
import { Lock } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { cn } from '../../utils/cn'
import type {
  AttendanceRecord,
  ClassRegisterResponse,
  HolidayKind,
  RegisterDay,
  StudentSummary,
} from '@fyntra/schemas'

type CellTone = 'present' | 'late' | 'absent' | 'halfday' | 'excused' | 'holiday' | 'empty'
interface Cell {
  letter: string
  tone: CellTone
  title: string
}

const TONE_CLASSES: Record<CellTone, string> = {
  present: 'bg-status-present/10 text-status-present',
  late: 'bg-status-late/10 text-status-late',
  absent: 'bg-status-absent/10 text-status-absent',
  halfday: 'bg-status-late/10 text-status-late',
  excused: 'bg-status-notyet/10 text-status-notyet',
  holiday: 'bg-stone-100 text-stone-400',
  empty: 'text-stone-300',
}

function holidayHeaderLetter(kind: HolidayKind | undefined): string {
  if (!kind) return ''
  if (kind === 'closed') return 'H'
  if (kind === 'exam') return 'X'
  return 'HD' // half_day
}

function computeCell(
  day: RegisterDay,
  record: AttendanceRecord | undefined,
  reasonExcused: boolean,
  t: (k: string) => string,
): Cell {
  if (day.holiday?.kind === 'closed') return { letter: 'H', tone: 'holiday', title: day.holiday.label }
  if (day.holiday?.kind === 'exam') return { letter: 'X', tone: 'holiday', title: day.holiday.label }
  if (!day.isWorkingDay && !day.holiday) return { letter: '·', tone: 'empty', title: '' }
  if (!record) return { letter: '·', tone: 'empty', title: t('teacher.register.cell.noRecord') }
  switch (record.status) {
    case 'present':
    case 'left_early':
      return { letter: 'P', tone: 'present', title: t('teacher.register.cell.present') }
    case 'late':
      return { letter: 'L', tone: 'late', title: t('teacher.register.cell.late') }
    case 'half_day':
      return { letter: 'HD', tone: 'halfday', title: t('teacher.register.cell.halfDay') }
    case 'absent':
      return reasonExcused
        ? { letter: 'E', tone: 'excused', title: t('teacher.register.cell.excused') }
        : { letter: 'A', tone: 'absent', title: t('teacher.register.cell.absent') }
    case 'unverified':
      return { letter: '?', tone: 'empty', title: t('teacher.register.cell.unverified') }
  }
  return { letter: '·', tone: 'empty', title: '' }
}

function monthLabel(month: string, locale: string): string {
  const [y, m] = month.split('-').map(Number) as [number, number]
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleString(locale, {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

export interface RegisterGridProps {
  data: ClassRegisterResponse
  locale: string
}

export function RegisterGrid({ data, locale }: RegisterGridProps) {
  const { t } = useTranslation()

  // Approximate excused-record assignment: the wire ships per-student
  // excused counts (via summaries) but not per-record reasonKind. We mark
  // the first N absent records (sorted by date) as excused. Backend can
  // promote reasonKind onto AttendanceRecord in a follow-up for exact
  // cell-level fidelity.
  const excusedRecords = useMemo(() => {
    const set = new Set<string>()
    const summaryByStudent = new Map<string, StudentSummary>(
      data.summaries.map((s) => [s.studentId, s]),
    )
    const absentsByStudent = new Map<string, AttendanceRecord[]>()
    for (const r of data.records) {
      if (r.status !== 'absent') continue
      const list = absentsByStudent.get(r.studentId) ?? []
      list.push(r)
      absentsByStudent.set(r.studentId, list)
    }
    for (const [studentId, absents] of absentsByStudent.entries()) {
      const excusedCount = summaryByStudent.get(studentId)?.excused ?? 0
      if (excusedCount === 0) continue
      absents.sort((a, b) => a.date.localeCompare(b.date))
      for (let i = 0; i < Math.min(excusedCount, absents.length); i++) {
        set.add(absents[i]!.id)
      }
    }
    return set
  }, [data.records, data.summaries])

  const recordBy = useMemo(() => {
    const m = new Map<string, AttendanceRecord>()
    for (const r of data.records) m.set(`${r.studentId}|${r.date}`, r)
    return m
  }, [data.records])

  const dailyTotals = useMemo(() => {
    return data.days.map((d) => {
      let p = 0, a = 0, l = 0
      for (const s of data.students) {
        const r = recordBy.get(`${s.id}|${d.date}`)
        if (!r) continue
        if (r.status === 'present' || r.status === 'left_early') p++
        else if (r.status === 'absent') a++
        else if (r.status === 'late') l++
      }
      return { date: d.date, p, a, l }
    })
  }, [data.days, data.students, recordBy])

  return (
    <div className="overflow-hidden rounded-2xl bg-white shadow-elev-1 ring-1 ring-stone-200">
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-stone-50 text-micro uppercase text-stone-500">
            <tr>
              <th
                scope="col"
                className="sticky left-0 z-10 bg-stone-50 px-3 py-2 text-left font-semibold"
              >
                {t('teacher.register.headers.student')}
              </th>
              {data.days.map((d) => {
                const dayNum = parseInt(d.date.slice(-2), 10)
                const headerLetter = holidayHeaderLetter(d.holiday?.kind)
                return (
                  <th
                    key={d.date}
                    scope="col"
                    title={d.holiday?.label ?? ''}
                    className={cn(
                      'min-w-[2rem] px-1 py-2 text-center font-mono font-semibold tabular-nums',
                      d.isWorkingDay ? 'text-stone-700' : 'bg-stone-100 text-stone-400',
                    )}
                  >
                    <div className="leading-none">{dayNum}</div>
                    {headerLetter ? (
                      <div className="mt-0.5 text-[10px] font-bold leading-none text-status-late">
                        {headerLetter}
                      </div>
                    ) : null}
                  </th>
                )
              })}
              <th scope="col" className="px-3 py-2 text-right font-semibold">WD</th>
              <th scope="col" className="px-3 py-2 text-right font-semibold">P</th>
              <th scope="col" className="px-3 py-2 text-right font-semibold">L</th>
              <th scope="col" className="px-3 py-2 text-right font-semibold">A</th>
              <th scope="col" className="px-3 py-2 text-right font-semibold">HD</th>
              <th scope="col" className="px-3 py-2 text-right font-semibold">E</th>
              <th scope="col" className="px-3 py-2 text-right font-semibold">%</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {data.students.map((s) => {
              const summary = data.summaries.find((x) => x.studentId === s.id)!
              return (
                <tr key={s.id} className="hover:bg-stone-50/60">
                  <th
                    scope="row"
                    className="sticky left-0 z-10 bg-white px-3 py-2 text-left font-medium text-stone-900"
                  >
                    <span className="font-mono text-xs text-stone-500">{s.rollNumber}</span>
                    <span className="ml-2">{s.fullName}</span>
                  </th>
                  {data.days.map((d) => {
                    const rec = recordBy.get(`${s.id}|${d.date}`)
                    const cell = computeCell(d, rec, rec ? excusedRecords.has(rec.id) : false, t)
                    const locked = rec?.lockedAt
                    return (
                      <td
                        key={d.date}
                        title={cell.title}
                        className={cn(
                          'relative px-1 py-2 text-center font-mono text-xs font-semibold',
                          TONE_CLASSES[cell.tone],
                        )}
                      >
                        {cell.letter}
                        {locked ? (
                          <Lock
                            aria-hidden="true"
                            className="absolute right-0.5 top-0.5 h-2.5 w-2.5 text-stone-500"
                          />
                        ) : null}
                      </td>
                    )
                  })}
                  <td className="px-3 py-2 text-right font-mono tabular-nums text-stone-700">{summary.workingDays}</td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums text-status-present">{summary.present}</td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums text-status-late">{summary.late}</td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums text-status-absent">{summary.absent}</td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums text-status-late">{summary.halfDay}</td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums text-status-notyet">{summary.excused}</td>
                  <td className="px-3 py-2 text-right font-mono font-semibold tabular-nums text-stone-900">
                    {summary.attendancePct === null ? '—' : `${summary.attendancePct.toFixed(1)}%`}
                  </td>
                </tr>
              )
            })}
          </tbody>
          <tfoot className="border-t border-stone-200 bg-stone-50">
            <tr className="text-xs text-stone-500">
              <th
                scope="row"
                className="sticky left-0 z-10 bg-stone-50 px-3 py-2 text-left font-medium"
              >
                {t('teacher.register.totals.label')}
              </th>
              {dailyTotals.map((d) => (
                <td key={d.date} className="px-1 py-2 text-center font-mono tabular-nums">
                  <div className="text-status-present">{d.p}</div>
                  <div className="text-status-absent">{d.a}</div>
                  <div className="text-status-late">{d.l}</div>
                </td>
              ))}
              <td colSpan={7} aria-hidden="true" />
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="px-3 py-2 text-xs text-stone-500">
        {monthLabel(data.month, locale)} · {t('teacher.register.legend')}
      </p>
    </div>
  )
}
