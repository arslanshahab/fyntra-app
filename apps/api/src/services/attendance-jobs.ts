import { and, eq, inArray, isNull, or } from 'drizzle-orm'
import cron from 'node-cron'
import { db } from '../db/client.js'
import { schools } from '../db/schema/schools.js'
import { students } from '../db/schema/students.js'
import { studentGuardians } from '../db/schema/students.js'
import { cards } from '../db/schema/cards.js'
import { devices } from '../db/schema/devices.js'
import { attendanceRecords } from '../db/schema/attendance.js'
import { newId } from '../lib/ids.js'
import { broker, channels } from './realtime.js'
import { ymdInKarachi } from '../lib/time.js'
import { dispatchInAppNotification } from '../modules/notifications/service.js'

export interface AbsentJobResult {
  markedAbsent: number
  markedUnverified: number
}

export async function runAbsentJobForSchool(schoolId: string, ymd: string): Promise<AbsentJobResult> {
  // Are entry devices online?
  const entryDevices = await db
    .select()
    .from(devices)
    .where(
      and(
        eq(devices.schoolId, schoolId),
        isNull(devices.deletedAt),
        or(eq(devices.direction, 'in'), eq(devices.direction, 'both')),
      ),
    )
  const anyEntryOnline = entryDevices.some((d) => d.status === 'online')

  // Active students with an active card and no record today.
  const activeStudents = await db
    .select({ id: students.id })
    .from(students)
    .innerJoin(cards, and(eq(cards.studentId, students.id), eq(cards.status, 'active'), isNull(cards.deletedAt)))
    .where(and(eq(students.schoolId, schoolId), eq(students.status, 'active')))

  if (activeStudents.length === 0) return { markedAbsent: 0, markedUnverified: 0 }

  const existing = await db
    .select({ studentId: attendanceRecords.studentId })
    .from(attendanceRecords)
    .where(and(eq(attendanceRecords.schoolId, schoolId), eq(attendanceRecords.date, ymd)))
  const have = new Set(existing.map((r) => r.studentId))
  const missing = activeStudents.filter((s) => !have.has(s.id))
  if (missing.length === 0) return { markedAbsent: 0, markedUnverified: 0 }

  const status: 'absent' | 'unverified' = anyEntryOnline ? 'absent' : 'unverified'
  const rows = missing.map((s) => ({
    id: newId(),
    schoolId,
    studentId: s.id,
    date: ymd,
    firstInAt: null,
    lastOutAt: null,
    status,
    isManual: false,
  }))
  await db.insert(attendanceRecords).values(rows)

  const count: AbsentJobResult = { markedAbsent: 0, markedUnverified: 0 }
  if (status === 'absent') count.markedAbsent = rows.length
  else count.markedUnverified = rows.length

  if (status === 'absent') {
    // Fan out 'absent' notifications to guardians of these students.
    const guardians = await db
      .select({ userId: studentGuardians.userId, studentId: studentGuardians.studentId })
      .from(studentGuardians)
      .where(
        and(
          eq(studentGuardians.schoolId, schoolId),
          inArray(studentGuardians.studentId, missing.map((s) => s.id)),
        ),
      )
    for (const g of guardians) {
      const dispatched = await dispatchInAppNotification({
        schoolId,
        recipientUserId: g.userId,
        event: 'absent',
        title: 'Marked absent',
        body: `No tap by ${ymd} cutoff`,
      })
      if (dispatched) {
        broker.publish(channels.student(g.studentId), { type: 'absent', studentId: g.studentId, date: ymd })
      }
    }
  }

  return count
}

const scheduled = new Map<string, cron.ScheduledTask>()

export async function bootstrapAbsentJobs(): Promise<void> {
  // For each school, schedule one cron at startTime + absentThresholdMinutes Karachi.
  const all = await db.select().from(schools)
  for (const s of all) {
    if (scheduled.has(s.id)) continue
    const [h, m] = s.startTime.split(':').map(Number) as [number, number]
    const totalMins = m + s.absentThresholdMinutes
    const cronH = h + Math.floor(totalMins / 60)
    const cronM = totalMins % 60
    if (cronH > 23) {
      // Absent cutoff would cross midnight; not yet supported. Log and skip.
      console.warn(
        `[absent-job] school ${s.id} startTime ${s.startTime} + absentThresholdMinutes ${s.absentThresholdMinutes} exceeds 23:59 — skipping schedule`,
      )
      continue
    }
    const task = cron.schedule(
      `${cronM} ${cronH} * * 1-5`,
      () => {
        const ymd = ymdInKarachi(new Date())
        runAbsentJobForSchool(s.id, ymd).catch(() => {})
      },
      { timezone: 'Asia/Karachi' },
    )
    scheduled.set(s.id, task)
  }
}
