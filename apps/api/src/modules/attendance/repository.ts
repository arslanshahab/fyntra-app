import { and, asc, eq } from 'drizzle-orm'
import { db } from '../../db/client.js'
import { tapEvents, attendanceRecords } from '../../db/schema/attendance.js'
import { schools } from '../../db/schema/schools.js'
import { newId } from '../../lib/ids.js'

export const attendanceRepo = {
  async school(schoolId: string) {
    const rows = await db.select().from(schools).where(eq(schools.id, schoolId)).limit(1)
    return rows[0]
  },
  async tapsForDay(schoolId: string, studentId: string, ymd: string) {
    // Karachi is UTC+5 (no DST). Midnight Karachi for `ymd` is `ymd - 5h` UTC.
    // Using ISO offset `+05:00` because that's the Karachi offset, not `-05:00`.
    const dayStart = new Date(`${ymd}T00:00:00+05:00`)
    const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000)
    return db
      .select()
      .from(tapEvents)
      .where(
        and(
          eq(tapEvents.schoolId, schoolId),
          eq(tapEvents.studentId, studentId),
        ),
      )
      .orderBy(asc(tapEvents.occurredAt))
      // filter in JS to avoid drizzle date column type juggling for this prototype
      .then((rows) =>
        rows.filter(
          (r) => r.occurredAt >= dayStart && r.occurredAt < dayEnd && !r.deduplicated,
        ),
      )
  },
  async findRecord(schoolId: string, studentId: string, ymd: string) {
    const rows = await db
      .select()
      .from(attendanceRecords)
      .where(
        and(
          eq(attendanceRecords.schoolId, schoolId),
          eq(attendanceRecords.studentId, studentId),
          eq(attendanceRecords.date, ymd),
        ),
      )
      .limit(1)
    return rows[0]
  },
  async upsertRecord(input: {
    schoolId: string
    studentId: string
    date: string
    firstInAt: Date | null
    lastOutAt: Date | null
    status: 'present' | 'absent' | 'late' | 'left_early' | 'unverified' | 'half_day'
    isManual: boolean
  }) {
    const existing = await this.findRecord(input.schoolId, input.studentId, input.date)
    if (existing) {
      await db
        .update(attendanceRecords)
        .set({
          firstInAt: input.firstInAt,
          lastOutAt: input.lastOutAt,
          status: input.status,
          isManual: input.isManual,
          updatedAt: new Date(),
        })
        .where(eq(attendanceRecords.id, existing.id))
      const rec = await this.findRecord(input.schoolId, input.studentId, input.date)
      return rec!
    }
    const id = newId()
    await db.insert(attendanceRecords).values({
      id,
      schoolId: input.schoolId,
      studentId: input.studentId,
      date: input.date,
      firstInAt: input.firstInAt,
      lastOutAt: input.lastOutAt,
      status: input.status,
      isManual: input.isManual,
    })
    const rec = await this.findRecord(input.schoolId, input.studentId, input.date)
    return rec!
  },
}
