import { and, eq, inArray } from 'drizzle-orm'
import type { TodaySummaryClass, TodaySummaryResponse } from '@fyntra/schemas'
import { db } from '../../db/client.js'
import { classes } from '../../db/schema/schools.js'
import { students } from '../../db/schema/students.js'
import { attendanceRecords, tapEvents } from '../../db/schema/attendance.js'
import { ymdInKarachi } from '../../lib/time.js'
import type { TenantContext } from '../../types/tenant-context.js'

// Admin-dashboard rollup: which classes have signed off the day's register,
// and what does the day look like per class. Admin-only — service gate
// enforces, route caller forwards.
export async function getTodaySummary(ctx: TenantContext): Promise<TodaySummaryResponse> {
  const today = ymdInKarachi(new Date())

  // 1) All classes in the school.
  const classRows = await db
    .select({ id: classes.id, name: classes.name })
    .from(classes)
    .where(eq(classes.schoolId, ctx.schoolId))

  if (classRows.length === 0) return { date: today, classes: [] }

  // 2) All active students grouped by class.
  const studentRows = await db
    .select({ id: students.id, classId: students.classId })
    .from(students)
    .where(
      and(
        eq(students.schoolId, ctx.schoolId),
        eq(students.status, 'active'),
      ),
    )
  const studentIdsByClass = new Map<string, string[]>()
  for (const s of studentRows) {
    const list = studentIdsByClass.get(s.classId) ?? []
    list.push(s.id)
    studentIdsByClass.set(s.classId, list)
  }

  // 3) Today's records for every active student.
  const allStudentIds = studentRows.map((s) => s.id)
  const records = allStudentIds.length
    ? await db
        .select()
        .from(attendanceRecords)
        .where(
          and(
            eq(attendanceRecords.schoolId, ctx.schoolId),
            eq(attendanceRecords.date, today),
            inArray(attendanceRecords.studentId, allStudentIds),
          ),
        )
    : []
  const recordsByStudent = new Map(records.map((r) => [r.studentId, r]))

  // 4) Today's manual tap events with sick/leave reasons — used to classify
  //    absent records as excused on the wire.
  const excusedKeys = new Set<string>()
  if (allStudentIds.length > 0) {
    const taps = await db
      .select({
        studentId: tapEvents.studentId,
        occurredAt: tapEvents.occurredAt,
        kind: tapEvents.manualReasonKind,
      })
      .from(tapEvents)
      .where(
        and(
          eq(tapEvents.schoolId, ctx.schoolId),
          eq(tapEvents.source, 'manual'),
          inArray(tapEvents.studentId, allStudentIds),
        ),
      )
    const dayStart = new Date(`${today}T00:00:00+05:00`).getTime()
    const dayEnd = new Date(`${today}T23:59:59+05:00`).getTime()
    for (const tap of taps) {
      if (!tap.studentId || !tap.kind) continue
      if (tap.kind !== 'sick' && tap.kind !== 'leave') continue
      const ts = tap.occurredAt.getTime()
      if (ts < dayStart || ts > dayEnd) continue
      excusedKeys.add(tap.studentId)
    }
  }

  // 5) Compose per-class summaries.
  const classes_: TodaySummaryClass[] = classRows.map((c) => {
    const ids = studentIdsByClass.get(c.id) ?? []
    const totals = { present: 0, absent: 0, late: 0, halfDay: 0, excused: 0, noRecord: 0 }
    let locked = false
    let lockedAt: Date | null = null
    let lockedBy: string | null = null
    for (const studentId of ids) {
      const r = recordsByStudent.get(studentId)
      if (!r) {
        totals.noRecord++
        continue
      }
      if (r.lockedAt) {
        locked = true
        lockedAt = r.lockedAt
        lockedBy = r.lockedBy
      }
      switch (r.status) {
        case 'present':
        case 'left_early':
          totals.present++
          break
        case 'late':
          totals.late++
          break
        case 'half_day':
          totals.halfDay++
          break
        case 'absent':
          if (excusedKeys.has(studentId)) totals.excused++
          else totals.absent++
          break
        case 'unverified':
          totals.noRecord++
          break
      }
    }
    return {
      classId: c.id,
      className: c.name,
      locked,
      ...(lockedAt ? { lockedAt: lockedAt.toISOString() } : {}),
      ...(lockedBy ? { lockedBy } : {}),
      totals,
    }
  })

  return { date: today, classes: classes_ }
}
