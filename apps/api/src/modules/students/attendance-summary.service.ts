import { and, eq } from 'drizzle-orm'
import type { AttendanceCounts, StudentAttendanceSummary, Weekday } from '@fyntra/schemas'
import { db } from '../../db/client.js'
import { studentGuardians } from '../../db/schema/students.js'
import { ForbiddenError, NotFoundError } from '../../lib/errors.js'
import { ymdInKarachi } from '../../lib/time.js'
import { classesRepo } from '../classes/repository.js'
import { schoolsRepo } from '../schools/repository.js'
import { studentsRepo } from './repository.js'
import type { TenantContext } from '../../types/tenant-context.js'

const WEEKDAYS: readonly Weekday[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

function weekdayOfYmd(ymd: string): Weekday {
  const [y, m, d] = ymd.split('-').map(Number) as [number, number, number]
  return WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]!
}

// Enumerate every Karachi-calendar date between `from` and `to` (inclusive).
function ymdRange(fromYmd: string, toYmd: string): string[] {
  const [fy, fm, fd] = fromYmd.split('-').map(Number) as [number, number, number]
  const [ty, tm, td] = toYmd.split('-').map(Number) as [number, number, number]
  const out: string[] = []
  const cur = new Date(Date.UTC(fy, fm - 1, fd))
  const end = new Date(Date.UTC(ty, tm - 1, td))
  while (cur.getTime() <= end.getTime()) {
    out.push(
      `${cur.getUTCFullYear()}-${pad2(cur.getUTCMonth() + 1)}-${pad2(cur.getUTCDate())}`,
    )
    cur.setUTCDate(cur.getUTCDate() + 1)
  }
  return out
}

function monthBounds(month: string): { from: string; to: string } {
  const [y, m] = month.split('-').map(Number) as [number, number]
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate()
  return {
    from: `${y}-${pad2(m)}-01`,
    to: `${y}-${pad2(m)}-${pad2(last)}`,
  }
}

// Year window: academic year if configured and started, else calendar year
// since Jan 1. Always capped at today.
function yearBounds(
  school: { academicYearStart: string | null; academicYearEnd: string | null },
  today: string,
): { from: string; to: string } {
  const [yy] = today.split('-').map(Number) as [number, number, number]
  // If academicYearStart is set and on/before today, use it.
  if (school.academicYearStart && school.academicYearStart <= today) {
    const to = school.academicYearEnd && school.academicYearEnd <= today ? school.academicYearEnd : today
    return { from: school.academicYearStart, to }
  }
  // Otherwise fall back to calendar year-to-date.
  return { from: `${yy}-01-01`, to: today }
}

// Compute the attendance counts + % for the given date range.
async function countsForRange(
  ctx: TenantContext,
  studentId: string,
  fromYmd: string,
  toYmd: string,
  school: { workingDays: string[] },
): Promise<AttendanceCounts> {
  const holidays = await classesRepo.holidaysForRange(ctx, fromYmd, toYmd)
  const records = await classesRepo.recordsForStudentsInRange(ctx, [studentId], fromYmd, toYmd)
  const excusedKeys = await classesRepo.excusedKeysInRange(ctx, [studentId], fromYmd, toYmd)
  const workingDayCodes = new Set<string>(school.workingDays)
  const holidayByDate = new Map(holidays.map((h) => [h.date, h]))

  let workingDays = 0
  for (const ymd of ymdRange(fromYmd, toYmd)) {
    const baseWorking = workingDayCodes.has(weekdayOfYmd(ymd))
    if (!baseWorking) continue
    const hol = holidayByDate.get(ymd)
    if (hol?.kind === 'closed' || hol?.kind === 'exam') continue
    workingDays++
  }

  let present = 0
  let absent = 0
  let late = 0
  let halfDay = 0
  let excused = 0
  for (const r of records) {
    const key = `${r.studentId}|${r.date}`
    switch (r.status) {
      case 'present':
      case 'left_early':
        present++
        break
      case 'late':
        late++
        break
      case 'half_day':
        halfDay++
        break
      case 'absent':
        if (excusedKeys.has(key)) excused++
        else absent++
        break
      case 'unverified':
        break
    }
  }

  let attendancePct: number | null = null
  if (workingDays > 0) {
    const raw = ((present + late + excused + halfDay * 0.5) / workingDays) * 100
    attendancePct = Math.round(raw * 10) / 10
  }

  return { workingDays, present, absent, late, halfDay, excused, attendancePct }
}

export interface SummaryInput {
  studentId: string
  month?: string
  year?: string // only used as a hint; the date window is school-derived
}

// Authorization gate: admin (any student in school), teacher (of student's
// class), parent (guardian of student). Cross-tenant 404 first.
async function authorize(ctx: TenantContext, studentId: string) {
  const student = await studentsRepo.findById(ctx, studentId)
  if (!student) throw new NotFoundError('Student not found')
  if (ctx.role === 'admin') return student
  if (ctx.role === 'teacher') {
    const klass = await classesRepo.findById(ctx, student.classId)
    if (!klass || klass.teacherId !== ctx.userId) throw new ForbiddenError()
    return student
  }
  if (ctx.role === 'parent') {
    const rows = await db
      .select({ userId: studentGuardians.userId })
      .from(studentGuardians)
      .where(
        and(
          eq(studentGuardians.schoolId, ctx.schoolId),
          eq(studentGuardians.studentId, studentId),
          eq(studentGuardians.userId, ctx.userId),
        ),
      )
      .limit(1)
    if (rows.length === 0) throw new ForbiddenError()
    return student
  }
  throw new ForbiddenError()
}

export async function getStudentAttendanceSummary(
  ctx: TenantContext,
  input: SummaryInput,
): Promise<StudentAttendanceSummary> {
  await authorize(ctx, input.studentId)

  const school = await schoolsRepo.findById(ctx.schoolId)
  if (!school) throw new NotFoundError('School not found')

  const today = ymdInKarachi(new Date())
  const month = input.month ?? today.slice(0, 7)
  const { from: monthFrom, to: monthTo } = monthBounds(month)
  const { from: yearFrom, to: yearTo } = yearBounds(school, today)

  const [monthCounts, yearCounts] = await Promise.all([
    countsForRange(ctx, input.studentId, monthFrom, monthTo, school),
    countsForRange(ctx, input.studentId, yearFrom, yearTo, school),
  ])

  return {
    studentId: input.studentId,
    month: { period: month, counts: monthCounts },
    year: { from: yearFrom, to: yearTo, counts: yearCounts },
  }
}
