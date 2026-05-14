import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../../app.js'
import { truncateAll } from '../../../tests/helpers/db.js'
import { db } from '../../db/client.js'
import { schools, classes } from '../../db/schema/schools.js'
import { users } from '../../db/schema/auth.js'
import { students, studentGuardians } from '../../db/schema/students.js'
import { cards } from '../../db/schema/cards.js'
import { devices } from '../../db/schema/devices.js'
import { tapEvents, attendanceRecords } from '../../db/schema/attendance.js'
import { notificationSettings, notificationLogs } from '../../db/schema/notifications.js'
import { newId } from '../../lib/ids.js'
import { eq } from 'drizzle-orm'

let app: FastifyInstance

beforeAll(async () => {
  app = await buildApp()
  await app.ready()
})
afterAll(async () => {
  await app.close()
})
beforeEach(async () => {
  await truncateAll()
})

async function seedOneSchool() {
  const schoolId = newId()
  const teacherId = newId()
  const adminId = newId()
  const parentId = newId()
  const classId = newId()
  const studentId = newId()
  const cardId = newId()
  const deviceId = newId()
  await db.insert(schools).values({
    id: schoolId, name: 'A', address: 'a',
    startTime: '07:45', endTime: '13:30',
    lateThresholdMinutes: 10, absentThresholdMinutes: 30,
  })
  await db.insert(users).values([
    { id: teacherId, schoolId, role: 'teacher', fullName: 'T', phone: '+923001200090', preferredLanguage: 'en' },
    { id: adminId, schoolId, role: 'admin', fullName: 'A', phone: '+923001100090', preferredLanguage: 'en' },
    { id: parentId, schoolId, role: 'parent', fullName: 'P', phone: '+923001000090', preferredLanguage: 'en' },
  ])
  await db.insert(classes).values({ id: classId, schoolId, name: 'CA', teacherId })
  await db.insert(students).values({ id: studentId, schoolId, classId, fullName: 'S', rollNumber: '001', status: 'active' })
  await db.insert(studentGuardians).values({ studentId, userId: parentId, schoolId, relationship: 'guardian' })
  await db.insert(cards).values({ id: cardId, schoolId, rfidUid: 'AAA', studentId, status: 'active' })
  await db.insert(devices).values({ id: deviceId, schoolId, label: 'gate', direction: 'both', status: 'online', lastHeartbeat: new Date() })
  await db.insert(notificationSettings).values({
    userId: parentId, schoolId,
    whatsapp: false, sms: false, inApp: true,
    eventTapIn: true, eventTapOut: true, eventLate: true, eventAbsent: true,
    eventManualOverride: true, eventDeviceOffline: false,
  })
  return { schoolId, teacherId, adminId, parentId, studentId, cardId, deviceId }
}

function token(app: FastifyInstance, payload: { userId: string; schoolId: string; role: 'parent' | 'admin' | 'teacher' }) {
  return app.jwt.sign(payload, { expiresIn: '1h' })
}

describe('tap-events routes', () => {
  it('GET /tap-events?studentId= returns the student\'s tap history', async () => {
    const { schoolId, adminId, studentId, deviceId, cardId } = await seedOneSchool()
    await db.insert(tapEvents).values([
      { id: newId(), schoolId, cardId, rfidUid: 'AAA', deviceId, studentId, direction: 'in', occurredAt: new Date('2026-05-13T02:48:00Z'), source: 'device' },
      { id: newId(), schoolId, cardId, rfidUid: 'AAA', deviceId, studentId, direction: 'out', occurredAt: new Date('2026-05-13T08:30:00Z'), source: 'device' },
    ])
    const t = token(app, { userId: adminId, schoolId, role: 'admin' })
    const res = await app.inject({
      method: 'GET',
      url: `/tap-events?studentId=${studentId}`,
      headers: { authorization: `Bearer ${t}` },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json() as Array<{ direction: string }>
    expect(body).toHaveLength(2)
    // ordered DESC by occurredAt
    expect(body[0]?.direction).toBe('out')
    expect(body[1]?.direction).toBe('in')
  })

  it('POST /tap-events/manual records the override + recomputes attendance + writes notification', async () => {
    const { schoolId, teacherId, parentId, studentId } = await seedOneSchool()
    const t = token(app, { userId: teacherId, schoolId, role: 'teacher' })
    const res = await app.inject({
      method: 'POST',
      url: '/tap-events/manual',
      headers: { authorization: `Bearer ${t}` },
      payload: {
        studentId,
        direction: 'in',
        occurredAt: new Date('2026-05-13T02:48:00Z').toISOString(),
        reason: 'Forgot card at home',
      },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json() as { deduplicated: boolean; recordStatus: string | null }
    expect(body.recordStatus).toBe('present')

    // Verify tap_events row with source=manual
    const taps = await db.select().from(tapEvents).where(eq(tapEvents.studentId, studentId))
    expect(taps).toHaveLength(1)
    expect(taps[0]?.source).toBe('manual')
    expect(taps[0]?.manualReason).toBe('Forgot card at home')
    expect(taps[0]?.manualOverrideBy).toBe(teacherId)
    expect(taps[0]?.deviceId).toBeNull()

    // Verify attendance_records row
    const recs = await db.select().from(attendanceRecords).where(eq(attendanceRecords.studentId, studentId))
    expect(recs[0]?.status).toBe('present')
    expect(recs[0]?.isManual).toBe(true)

    // Verify notification log for the parent
    const logs = await db.select().from(notificationLogs).where(eq(notificationLogs.recipientUserId, parentId))
    expect(logs).toHaveLength(1)
    expect(logs[0]?.channel).toBe('in_app')
  })

  it('POST /tap-events/manual without reason is rejected by Zod', async () => {
    const { schoolId, teacherId, studentId } = await seedOneSchool()
    const t = token(app, { userId: teacherId, schoolId, role: 'teacher' })
    const res = await app.inject({
      method: 'POST',
      url: '/tap-events/manual',
      headers: { authorization: `Bearer ${t}` },
      payload: {
        studentId,
        direction: 'in',
        occurredAt: new Date('2026-05-13T02:48:00Z').toISOString(),
        reason: '',
      },
    })
    expect(res.statusCode).toBe(400)
  })

  it('parent gets 403 on manual override', async () => {
    const { schoolId, parentId, studentId } = await seedOneSchool()
    const t = token(app, { userId: parentId, schoolId, role: 'parent' })
    const res = await app.inject({
      method: 'POST',
      url: '/tap-events/manual',
      headers: { authorization: `Bearer ${t}` },
      payload: {
        studentId,
        direction: 'in',
        occurredAt: new Date('2026-05-13T02:48:00Z').toISOString(),
        reason: 'irrelevant',
      },
    })
    expect(res.statusCode).toBe(403)
  })
})
