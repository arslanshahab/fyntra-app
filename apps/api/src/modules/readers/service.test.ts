import { describe, it, expect, beforeEach } from 'vitest'
import { truncateAll } from '../../../tests/helpers/db.js'
import { db } from '../../db/client.js'
import { schools, classes } from '../../db/schema/schools.js'
import { users } from '../../db/schema/auth.js'
import { students, studentGuardians } from '../../db/schema/students.js'
import { cards } from '../../db/schema/cards.js'
import { devices, deviceTokens } from '../../db/schema/devices.js'
import { notificationSettings } from '../../db/schema/notifications.js'
import { newId } from '../../lib/ids.js'
import { hashToken } from '../../lib/tokens.js'
import { ingestTap, resolveDeviceByToken } from './service.js'

async function seed() {
  const schoolId = newId()
  const teacherId = newId()
  const parentId = newId()
  const studentId = newId()
  const classId = newId()
  const cardId = newId()
  const deviceId = newId()
  const tokenPlain = 'devplain123_x'.padEnd(43, 'X')
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
  await db.insert(deviceTokens).values({
    id: newId(), schoolId, deviceId, tokenHash: hashToken(tokenPlain), label: 'dev',
  })
  await db.insert(notificationSettings).values({
    userId: parentId, schoolId,
    whatsapp: false, sms: false, inApp: true,
    eventTapIn: true, eventTapOut: true, eventLate: true, eventAbsent: true,
    eventManualOverride: true, eventDeviceOffline: false,
  })
  return { schoolId, deviceId, parentId, studentId, tokenPlain }
}

describe('reader service', () => {
  beforeEach(async () => {
    await truncateAll()
  })

  it('resolves device by token', async () => {
    const { tokenPlain, deviceId } = await seed()
    const ctx = await resolveDeviceByToken(tokenPlain)
    expect(ctx?.deviceId).toBe(deviceId)
  })

  it('ingests a tap, creates record, writes in-app log', async () => {
    const { tokenPlain } = await seed()
    const result = await ingestTap({
      tokenPlain,
      rfidUid: 'AABBCCDD',
      direction: 'in',
      occurredAt: new Date('2026-05-13T02:48:00Z'),
    })
    expect(result.deduplicated).toBe(false)
    expect(result.record?.status).toBe('present')
    expect(result.notificationCount).toBeGreaterThan(0)
  })

  it('dedupes a same-direction tap within 30s', async () => {
    const { tokenPlain } = await seed()
    const t0 = new Date('2026-05-13T02:48:00Z')
    await ingestTap({ tokenPlain, rfidUid: 'AABBCCDD', direction: 'in', occurredAt: t0 })
    const dupe = await ingestTap({
      tokenPlain, rfidUid: 'AABBCCDD', direction: 'in',
      occurredAt: new Date(t0.getTime() + 10_000), // 10s later
    })
    expect(dupe.deduplicated).toBe(true)
  })

  it('returns 404 for unknown rfidUid', async () => {
    const { tokenPlain } = await seed()
    await expect(
      ingestTap({ tokenPlain, rfidUid: 'NOPE', direction: 'in', occurredAt: new Date() }),
    ).rejects.toThrow(/not found/i)
  })

  it('rejects bad device token', async () => {
    await seed()
    await expect(
      ingestTap({ tokenPlain: 'invalid', rfidUid: 'AABBCCDD', direction: 'in', occurredAt: new Date() }),
    ).rejects.toThrow(/unauthorized|invalid/i)
  })
})
