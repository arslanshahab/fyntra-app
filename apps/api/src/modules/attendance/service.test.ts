import { describe, it, expect, beforeEach } from 'vitest'
import { truncateAll } from '../../../tests/helpers/db.js'
import { db } from '../../db/client.js'
import { schools, classes } from '../../db/schema/schools.js'
import { users } from '../../db/schema/auth.js'
import { students } from '../../db/schema/students.js'
import { tapEvents } from '../../db/schema/attendance.js'
import { devices } from '../../db/schema/devices.js'
import { newId } from '../../lib/ids.js'
import { recomputeAttendanceForDay } from './service.js'

async function seedOne() {
  const schoolId = newId()
  const teacherId = newId()
  const studentId = newId()
  const deviceId = newId()
  await db.insert(schools).values({
    id: schoolId,
    name: 's', address: 'a',
    startTime: '07:45', endTime: '13:30',
    lateThresholdMinutes: 10, absentThresholdMinutes: 30,
  })
  await db.insert(users).values({ id: teacherId, schoolId, role: 'teacher', fullName: 'T', phone: '+923001200001', preferredLanguage: 'en' })
  const classId = newId()
  await db.insert(classes).values({ id: classId, schoolId, name: 'c', teacherId })
  await db.insert(students).values({ id: studentId, schoolId, classId, fullName: 'S', rollNumber: '001', status: 'active' })
  await db.insert(devices).values({ id: deviceId, schoolId, label: 'gate', direction: 'both', status: 'offline' })
  return { schoolId, studentId, deviceId }
}

describe('recomputeAttendanceForDay', () => {
  beforeEach(async () => {
    await truncateAll()
  })

  it('marks present when in-tap is within late threshold', async () => {
    const { schoolId, studentId, deviceId } = await seedOne()
    // 2026-05-13 07:48 Karachi = 02:48 UTC
    const occurredAt = new Date('2026-05-13T02:48:00Z')
    await db.insert(tapEvents).values({
      id: newId(), schoolId, studentId, deviceId, rfidUid: 'X',
      direction: 'in', occurredAt, source: 'device',
    })
    const rec = await recomputeAttendanceForDay(schoolId, studentId, '2026-05-13')
    expect(rec!.status).toBe('present')
    expect(rec!.firstInAt).toEqual(occurredAt)
  })

  it('marks late when in-tap is past late threshold', async () => {
    const { schoolId, studentId, deviceId } = await seedOne()
    // 07:58 Karachi → past 07:55 lateThreshold
    const occurredAt = new Date('2026-05-13T02:58:00Z')
    await db.insert(tapEvents).values({
      id: newId(), schoolId, studentId, deviceId, rfidUid: 'X',
      direction: 'in', occurredAt, source: 'device',
    })
    const rec = await recomputeAttendanceForDay(schoolId, studentId, '2026-05-13')
    expect(rec!.status).toBe('late')
  })

  it('marks left_early when last out is before school endTime and not late', async () => {
    const { schoolId, studentId, deviceId } = await seedOne()
    const inAt = new Date('2026-05-13T02:48:00Z')   // 07:48 Karachi
    const outAt = new Date('2026-05-13T07:00:00Z')  // 12:00 Karachi (before 13:30)
    await db.insert(tapEvents).values([
      { id: newId(), schoolId, studentId, deviceId, rfidUid: 'X', direction: 'in', occurredAt: inAt, source: 'device' },
      { id: newId(), schoolId, studentId, deviceId, rfidUid: 'X', direction: 'out', occurredAt: outAt, source: 'device' },
    ])
    const rec = await recomputeAttendanceForDay(schoolId, studentId, '2026-05-13')
    expect(rec!.status).toBe('left_early')
  })

  it('late beats left_early', async () => {
    const { schoolId, studentId, deviceId } = await seedOne()
    const inAt = new Date('2026-05-13T02:58:00Z')   // late
    const outAt = new Date('2026-05-13T07:00:00Z')  // early
    await db.insert(tapEvents).values([
      { id: newId(), schoolId, studentId, deviceId, rfidUid: 'X', direction: 'in', occurredAt: inAt, source: 'device' },
      { id: newId(), schoolId, studentId, deviceId, rfidUid: 'X', direction: 'out', occurredAt: outAt, source: 'device' },
    ])
    const rec = await recomputeAttendanceForDay(schoolId, studentId, '2026-05-13')
    expect(rec!.status).toBe('late')
  })
})
