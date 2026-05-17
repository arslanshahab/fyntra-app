import { and, eq } from 'drizzle-orm'
import cron from 'node-cron'
import { db } from '../db/client.js'
import { users } from '../db/schema/auth.js'
import { schools } from '../db/schema/schools.js'
import { studentGuardians, students } from '../db/schema/students.js'
import { getStudentAttendanceSummary } from '../modules/students/attendance-summary.service.js'
import { dispatch } from '../modules/notifications/service.js'
import { ymdInKarachi } from '../lib/time.js'

// Karachi-month label like "May 2026" — what the WhatsApp template displays.
function karachiMonthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number) as [number, number]
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleString('en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

// Run the digest for a single school, computing one summary per (parent,
// child) pair and dispatching the monthly_summary event. Returns the count
// of records dispatched — useful for tests + the cron logs.
export async function runMonthlyDigestForSchool(schoolId: string, month: string): Promise<number> {
  // Gather parents + their children. A guardian may be linked to multiple
  // students (siblings); we want one notification per (parent, student) pair.
  const guardianRows = await db
    .select({
      userId: studentGuardians.userId,
      studentId: studentGuardians.studentId,
      phone: users.phone,
      studentName: students.fullName,
    })
    .from(studentGuardians)
    .innerJoin(users, eq(users.id, studentGuardians.userId))
    .innerJoin(students, eq(students.id, studentGuardians.studentId))
    .where(
      and(
        eq(studentGuardians.schoolId, schoolId),
        eq(users.role, 'parent'),
        eq(students.status, 'active'),
      ),
    )

  let dispatched = 0
  for (const g of guardianRows) {
    // Use a synthetic admin-ish context — the summary endpoint normally
    // gates by role/guardian linkage, but the cron is running unattended.
    const summary = await getStudentAttendanceSummary(
      { schoolId, userId: g.userId, role: 'parent' },
      { studentId: g.studentId, month },
    )
    const { counts } = summary.month
    const monthLabel = karachiMonthLabel(month)
    const pctText = counts.attendancePct === null ? '—' : `${counts.attendancePct.toFixed(0)}%`
    const fired = await dispatch({
      schoolId,
      recipientUserId: g.userId,
      event: 'monthly_summary',
      recipientPhone: g.phone,
      payloads: {
        inApp: {
          title: `${monthLabel} attendance summary`,
          body: `${g.studentName}: ${counts.present}/${counts.workingDays} days present (${pctText}). ${counts.late} late.`,
        },
        whatsapp: {
          templateName: 'fyntra_monthly_summary',
          languageCode: 'en',
          variables: [
            g.studentName,
            monthLabel,
            String(counts.present),
            String(counts.workingDays),
            pctText,
            String(counts.late),
          ],
          parameterNames: [
            'student_name',
            'month_label',
            'present_days',
            'working_days',
            'attendance_pct',
            'late_count',
          ],
        },
      },
    })
    if (fired > 0) dispatched++
  }
  return dispatched
}

// Last-day-of-month detector (Karachi). `today` already is the Karachi YMD,
// so just check whether tomorrow lands in the next month.
function isLastDayOfKarachiMonth(today: string): boolean {
  const [y, m, d] = today.split('-').map(Number) as [number, number, number]
  // Day of the month for "tomorrow" — if it's 1, today is last day.
  const tomorrow = new Date(Date.UTC(y, m - 1, d + 1))
  return tomorrow.getUTCMonth() !== m - 1
}

const scheduled = new Map<string, cron.ScheduledTask>()

// Schedules an end-of-month digest cron per school at 19:00 Karachi on
// candidate days (28, 29, 30, 31). The handler short-circuits on days that
// aren't actually the last day of the month.
export async function bootstrapMonthlyDigest(): Promise<void> {
  const all = await db.select().from(schools)
  for (const s of all) {
    if (scheduled.has(s.id)) continue
    const task = cron.schedule(
      '0 19 28-31 * *',
      () => {
        const today = ymdInKarachi(new Date())
        if (!isLastDayOfKarachiMonth(today)) return
        const month = today.slice(0, 7)
        runMonthlyDigestForSchool(s.id, month).catch((err: unknown) => {
          // Cron handlers must not throw; surface to the structured logger
          // so we can see it in production.
          console.error('[monthly-digest] failed for school', s.id, err)
        })
      },
      { timezone: 'Asia/Karachi' },
    )
    scheduled.set(s.id, task)
  }
}
