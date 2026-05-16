import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../../src/app.js'
import { truncateAll } from '../helpers/db.js'
import { db } from '../../src/db/client.js'
import { schools, classes } from '../../src/db/schema/schools.js'
import { users } from '../../src/db/schema/auth.js'
import { students, studentGuardians } from '../../src/db/schema/students.js'
import { cards } from '../../src/db/schema/cards.js'
import { devices, deviceTokens } from '../../src/db/schema/devices.js'
import { notificationSettings } from '../../src/db/schema/notifications.js'
import { newId } from '../../src/lib/ids.js'
import { hashToken } from '../../src/lib/tokens.js'

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

async function seed() {
  const schoolId = newId()
  const teacherId = newId()
  const parentId = newId()
  const studentId = newId()
  const classId = newId()
  const cardId = newId()
  const deviceId = newId()
  const tokenPlain = 'plain'.repeat(8)
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
  await db.insert(cards).values({ id: cardId, schoolId, rfidUid: 'AABBCCDD', studentId, status: 'active' })
  await db.insert(devices).values({ id: deviceId, schoolId, label: 'gate', direction: 'both', status: 'offline' })
  await db.insert(deviceTokens).values({ id: newId(), schoolId, deviceId, tokenHash: hashToken(tokenPlain), label: 'dev' })
  await db.insert(notificationSettings).values({
    userId: parentId, schoolId,
    whatsapp: false, sms: false, inApp: true,
    eventTapIn: true, eventTapOut: true, eventLate: true, eventAbsent: true,
    eventManualOverride: true, eventDeviceOffline: false,
  })
  return { tokenPlain }
}

describe('POST /readers/tap', () => {
  it('accepts a valid tap', async () => {
    const { tokenPlain } = await seed()
    const res = await app.inject({
      method: 'POST',
      url: '/readers/tap',
      payload: {
        rfidUid: 'AABBCCDD',
        direction: 'in',
        occurredAt: new Date('2026-05-13T02:48:00Z').toISOString(),
        deviceToken: tokenPlain,
      },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json() as { deduplicated: boolean }
    expect(body.deduplicated).toBe(false)
  })

  it('rejects a bad device token', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/readers/tap',
      payload: { rfidUid: 'X', direction: 'in', occurredAt: new Date().toISOString(), deviceToken: 'nope' },
    })
    expect(res.statusCode).toBe(401)
  })
})
