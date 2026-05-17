import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../../app.js'
import { truncateAll } from '../../../tests/helpers/db.js'
import { db } from '../../db/client.js'
import { schools, classes } from '../../db/schema/schools.js'
import { users } from '../../db/schema/auth.js'
import { students } from '../../db/schema/students.js'
import { attendanceRecords } from '../../db/schema/attendance.js'
import { newId } from '../../lib/ids.js'
import { todaySummaryResponseSchema } from '@fyntra/schemas'
import { ymdInKarachi } from '../../lib/time.js'

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
  const teacherA = newId()
  const teacherB = newId()
  const adminId = newId()
  const parentId = newId()
  const classA = newId()
  const classB = newId()
  const sA1 = newId()
  const sA2 = newId()
  const sB1 = newId()
  await db.insert(schools).values({
    id: schoolId, name: 'A', address: 'a', startTime: '07:45', endTime: '13:30',
    lateThresholdMinutes: 10, absentThresholdMinutes: 30,
  })
  await db.insert(users).values([
    { id: teacherA, schoolId, role: 'teacher', fullName: 'TA', phone: '+923001200090', preferredLanguage: 'en' },
    { id: teacherB, schoolId, role: 'teacher', fullName: 'TB', phone: '+923001200091', preferredLanguage: 'en' },
    { id: adminId, schoolId, role: 'admin', fullName: 'Admin', phone: '+923001100090', preferredLanguage: 'en' },
    { id: parentId, schoolId, role: 'parent', fullName: 'Parent', phone: '+923001000090', preferredLanguage: 'en' },
  ])
  await db.insert(classes).values([
    { id: classA, schoolId, name: 'Grade 3 A', teacherId: teacherA },
    { id: classB, schoolId, name: 'Grade 3 B', teacherId: teacherB },
  ])
  await db.insert(students).values([
    { id: sA1, schoolId, classId: classA, fullName: 'A1', rollNumber: '001', status: 'active' },
    { id: sA2, schoolId, classId: classA, fullName: 'A2', rollNumber: '002', status: 'active' },
    { id: sB1, schoolId, classId: classB, fullName: 'B1', rollNumber: '003', status: 'active' },
  ])
  return { schoolId, teacherA, teacherB, adminId, parentId, classA, classB, sA1, sA2, sB1 }
}

function token(app: FastifyInstance, payload: { userId: string; schoolId: string; role: 'parent' | 'admin' | 'teacher' }) {
  return app.jwt.sign(payload, { expiresIn: '1h' })
}

describe('GET /attendance/today-summary', () => {
  it('admin sees per-class totals for today', async () => {
    const { schoolId, adminId, classA, classB, sA1, sA2 } = await seed()
    const today = ymdInKarachi(new Date())
    // Class A: 1 present, 1 missing → noRecord 1.
    await db.insert(attendanceRecords).values({
      id: newId(), schoolId, studentId: sA1, date: today, status: 'present', isManual: false,
    })
    const t = token(app, { userId: adminId, schoolId, role: 'admin' })
    const res = await app.inject({
      method: 'GET', url: '/attendance/today-summary',
      headers: { authorization: `Bearer ${t}` },
    })
    expect(res.statusCode).toBe(200)
    const parsed = todaySummaryResponseSchema.parse(res.json())
    expect(parsed.date).toBe(today)
    expect(parsed.classes).toHaveLength(2)
    const ca = parsed.classes.find((c) => c.classId === classA)!
    expect(ca.className).toBe('Grade 3 A')
    expect(ca.locked).toBe(false)
    expect(ca.totals.present).toBe(1)
    expect(ca.totals.noRecord).toBe(1)
    const cb = parsed.classes.find((c) => c.classId === classB)!
    expect(cb.totals.noRecord).toBe(1)
    void sA2
  })

  it('locked flag + lockedBy populate when the class is locked', async () => {
    const { schoolId, adminId, teacherA, classA, sA1 } = await seed()
    const today = ymdInKarachi(new Date())
    const lockedAt = new Date()
    await db.insert(attendanceRecords).values({
      id: newId(), schoolId, studentId: sA1, date: today, status: 'present', isManual: false, lockedAt, lockedBy: teacherA,
    })
    const t = token(app, { userId: adminId, schoolId, role: 'admin' })
    const res = await app.inject({
      method: 'GET', url: '/attendance/today-summary',
      headers: { authorization: `Bearer ${t}` },
    })
    expect(res.statusCode).toBe(200)
    const parsed = todaySummaryResponseSchema.parse(res.json())
    const ca = parsed.classes.find((c) => c.classId === classA)!
    expect(ca.locked).toBe(true)
    expect(ca.lockedBy).toBe(teacherA)
    expect(ca.lockedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it('parent gets 403', async () => {
    const { schoolId, parentId } = await seed()
    const t = token(app, { userId: parentId, schoolId, role: 'parent' })
    const res = await app.inject({
      method: 'GET', url: '/attendance/today-summary',
      headers: { authorization: `Bearer ${t}` },
    })
    expect(res.statusCode).toBe(403)
  })

  it('teacher gets 403', async () => {
    const { schoolId, teacherA } = await seed()
    const t = token(app, { userId: teacherA, schoolId, role: 'teacher' })
    const res = await app.inject({
      method: 'GET', url: '/attendance/today-summary',
      headers: { authorization: `Bearer ${t}` },
    })
    expect(res.statusCode).toBe(403)
  })
})
