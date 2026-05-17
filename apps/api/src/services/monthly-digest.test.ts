import { describe, it, expect, beforeEach } from 'vitest'
import { eq } from 'drizzle-orm'
import { truncateAll } from '../../tests/helpers/db.js'
import { db } from '../db/client.js'
import { schools, classes } from '../db/schema/schools.js'
import { users } from '../db/schema/auth.js'
import { students, studentGuardians } from '../db/schema/students.js'
import { attendanceRecords } from '../db/schema/attendance.js'
import { notificationLogs, notificationSettings } from '../db/schema/notifications.js'
import { newId } from '../lib/ids.js'
import { runMonthlyDigestForSchool } from './monthly-digest.js'

interface Seed {
  schoolId: string
  parentId: string
  studentId: string
}

async function seed(opts: { monthlySummaryOptIn: boolean }): Promise<Seed> {
  const schoolId = newId()
  const teacherId = newId()
  const parentId = newId()
  const classId = newId()
  const studentId = newId()
  await db.insert(schools).values({
    id: schoolId, name: 's', address: 'a', startTime: '07:45', endTime: '13:30',
    lateThresholdMinutes: 10, absentThresholdMinutes: 30,
  })
  await db.insert(users).values([
    { id: teacherId, schoolId, role: 'teacher', fullName: 'T', phone: '+923001200001', preferredLanguage: 'en' },
    { id: parentId, schoolId, role: 'parent', fullName: 'P', phone: '+923001000001', preferredLanguage: 'en' },
  ])
  await db.insert(classes).values({ id: classId, schoolId, name: 'c', teacherId })
  await db.insert(students).values({ id: studentId, schoolId, classId, fullName: 'Ahmad', rollNumber: '001', status: 'active' })
  await db.insert(studentGuardians).values({ studentId, userId: parentId, schoolId, relationship: 'father' })
  await db.insert(notificationSettings).values({
    userId: parentId, schoolId,
    whatsapp: true, sms: false, inApp: true,
    eventTapIn: true, eventTapOut: true, eventLate: true, eventAbsent: true,
    eventManualOverride: true, eventDeviceOffline: false,
    eventMonthlySummary: opts.monthlySummaryOptIn,
  })
  // Seed two present days to make the summary non-trivial.
  await db.insert(attendanceRecords).values([
    { id: newId(), schoolId, studentId, date: '2026-05-04', status: 'present', isManual: false },
    { id: newId(), schoolId, studentId, date: '2026-05-05', status: 'late', isManual: false },
  ])
  return { schoolId, parentId, studentId }
}

describe('runMonthlyDigestForSchool', () => {
  beforeEach(async () => {
    await truncateAll()
  })

  it('dispatches whatsapp + in_app for an opted-in parent (one per child)', async () => {
    const { schoolId, parentId } = await seed({ monthlySummaryOptIn: true })
    const dispatched = await runMonthlyDigestForSchool(schoolId, '2026-05')
    expect(dispatched).toBe(1)
    const logs = await db
      .select()
      .from(notificationLogs)
      .where(eq(notificationLogs.recipientUserId, parentId))
    expect(logs.map((l) => l.channel).sort()).toEqual(['in_app', 'whatsapp'])
    // WhatsApp payload carries the template name + parameter names.
    const wa = logs.find((l) => l.channel === 'whatsapp')!
    expect(wa.payload.templateName).toBe('fyntra_monthly_summary')
    expect(wa.payload.variables?.[0]).toBe('Ahmad') // student_name
  })

  it('respects the monthly_summary opt-out — no logs when disabled', async () => {
    const { schoolId, parentId } = await seed({ monthlySummaryOptIn: false })
    const dispatched = await runMonthlyDigestForSchool(schoolId, '2026-05')
    expect(dispatched).toBe(0)
    const logs = await db
      .select()
      .from(notificationLogs)
      .where(eq(notificationLogs.recipientUserId, parentId))
    expect(logs).toHaveLength(0)
  })
})
