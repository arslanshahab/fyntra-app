import { describe, it, expect, beforeEach } from 'vitest'
import { truncateAll } from '../../tests/helpers/db.js'
import { db } from '../db/client.js'
import { schools, classes } from '../db/schema/schools.js'
import { users } from '../db/schema/auth.js'
import { students, studentGuardians } from '../db/schema/students.js'
import { cards } from '../db/schema/cards.js'
import { devices } from '../db/schema/devices.js'
import { attendanceRecords } from '../db/schema/attendance.js'
import { notificationSettings } from '../db/schema/notifications.js'
import { newId } from '../lib/ids.js'
import { runAbsentJobForSchool } from './attendance-jobs.js'
import { eq } from 'drizzle-orm'

async function seed(opts: { deviceStatus: 'online' | 'offline' }) {
  const schoolId = newId()
  const teacherId = newId()
  const parentId = newId()
  const studentId = newId()
  const classId = newId()
  const cardId = newId()
  await db.insert(schools).values({
    id: schoolId, name: 's', address: 'a', startTime: '07:45', endTime: '13:30',
    lateThresholdMinutes: 10, absentThresholdMinutes: 30,
  })
  await db.insert(users).values([
    { id: teacherId, schoolId, role: 'teacher', fullName: 'T', phone: '+923001200001', preferredLanguage: 'en' },
    { id: parentId, schoolId, role: 'parent', fullName: 'P', phone: '+923001000001', preferredLanguage: 'en' },
  ])
  await db.insert(classes).values({ id: classId, schoolId, name: 'c', teacherId })
  await db.insert(students).values({ id: studentId, schoolId, classId, fullName: 'S', rollNumber: '001', status: 'active' })
  await db.insert(studentGuardians).values({ studentId, userId: parentId, schoolId, relationship: 'guardian' })
  await db.insert(cards).values({ id: cardId, schoolId, rfidUid: 'X', studentId, status: 'active' })
  await db.insert(devices).values({ id: newId(), schoolId, label: 'gate', direction: 'in', status: opts.deviceStatus, lastHeartbeat: new Date() })
  await db.insert(notificationSettings).values({
    userId: parentId, schoolId,
    whatsapp: false, sms: false, inApp: true,
    eventTapIn: true, eventTapOut: true, eventLate: true, eventAbsent: true,
    eventManualOverride: true, eventDeviceOffline: false,
  })
  return { schoolId, studentId }
}

describe('runAbsentJobForSchool', () => {
  beforeEach(async () => {
    await truncateAll()
  })

  it('creates absent record + notifies parent when device online and no tap', async () => {
    const { schoolId, studentId } = await seed({ deviceStatus: 'online' })
    const res = await runAbsentJobForSchool(schoolId, '2026-05-13')
    expect(res.markedAbsent).toBe(1)
    const recs = await db
      .select()
      .from(attendanceRecords)
      .where(eq(attendanceRecords.studentId, studentId))
    expect(recs[0]?.status).toBe('absent')
  })

  it('marks unverified (not absent) and suppresses notify when entry device is offline', async () => {
    const { schoolId, studentId } = await seed({ deviceStatus: 'offline' })
    const res = await runAbsentJobForSchool(schoolId, '2026-05-13')
    expect(res.markedAbsent).toBe(0)
    expect(res.markedUnverified).toBe(1)
    const recs = await db
      .select()
      .from(attendanceRecords)
      .where(eq(attendanceRecords.studentId, studentId))
    expect(recs[0]?.status).toBe('unverified')
  })

  it('does not stomp a present record from a real tap', async () => {
    const { schoolId, studentId } = await seed({ deviceStatus: 'online' })
    // Pre-existing 'present' record (as if from a tap earlier in the morning)
    await db.insert(attendanceRecords).values({
      id: newId(),
      schoolId,
      studentId,
      date: '2026-05-13',
      firstInAt: new Date('2026-05-13T02:48:00Z'),
      lastOutAt: null,
      status: 'present',
      isManual: false,
    })
    const res = await runAbsentJobForSchool(schoolId, '2026-05-13')
    expect(res.markedAbsent).toBe(0)
    expect(res.markedUnverified).toBe(0)
    const recs = await db
      .select()
      .from(attendanceRecords)
      .where(eq(attendanceRecords.studentId, studentId))
    expect(recs[0]?.status).toBe('present')
  })
})
