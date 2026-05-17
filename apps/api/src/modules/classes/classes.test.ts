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

async function seedTwoSchools() {
  const schoolA = newId()
  const schoolB = newId()
  const teacherA = newId()
  const teacherB = newId()
  const classA = newId()
  const classB = newId()
  const adminA = newId()
  const studentA = newId()
  await db.insert(schools).values([
    { id: schoolA, name: 'A', address: 'a', startTime: '07:45', endTime: '13:30', lateThresholdMinutes: 10, absentThresholdMinutes: 30 },
    { id: schoolB, name: 'B', address: 'b', startTime: '07:45', endTime: '13:30', lateThresholdMinutes: 10, absentThresholdMinutes: 30 },
  ])
  await db.insert(users).values([
    { id: teacherA, schoolId: schoolA, role: 'teacher', fullName: 'TA', phone: '+923001200090', preferredLanguage: 'en' },
    { id: teacherB, schoolId: schoolB, role: 'teacher', fullName: 'TB', phone: '+923001200091', preferredLanguage: 'en' },
    { id: adminA, schoolId: schoolA, role: 'admin', fullName: 'AdminA', phone: '+923001100090', preferredLanguage: 'en' },
  ])
  await db.insert(classes).values([
    { id: classA, schoolId: schoolA, name: 'CA', teacherId: teacherA },
    { id: classB, schoolId: schoolB, name: 'CB', teacherId: teacherB },
  ])
  await db.insert(students).values({ id: studentA, schoolId: schoolA, classId: classA, fullName: 'SA', rollNumber: '001', status: 'active' })
  return { schoolA, schoolB, adminA, classA, classB, studentA }
}

function token(app: FastifyInstance, payload: { userId: string; schoolId: string; role: 'parent' | 'admin' | 'teacher' }) {
  return app.jwt.sign(payload, { expiresIn: '1h' })
}

describe('classes routes', () => {
  it('GET /classes returns only the caller school classes', async () => {
    const { schoolA, adminA, classA } = await seedTwoSchools()
    const t = token(app, { userId: adminA, schoolId: schoolA, role: 'admin' })
    const res = await app.inject({ method: 'GET', url: '/classes', headers: { authorization: `Bearer ${t}` } })
    expect(res.statusCode).toBe(200)
    const body = res.json() as Array<{ id: string; studentCount: number }>
    expect(body.map((c) => c.id)).toEqual([classA])
    expect(body[0]?.studentCount).toBe(1)
  })

  it('GET /classes/:id/attendance returns the day roster with records merged', async () => {
    const { schoolA, adminA, classA, studentA } = await seedTwoSchools()
    await db.insert(attendanceRecords).values({
      id: newId(),
      schoolId: schoolA,
      studentId: studentA,
      date: '2026-05-13',
      firstInAt: new Date('2026-05-13T02:48:00Z'),
      lastOutAt: null,
      status: 'present',
      isManual: false,
    })
    const t = token(app, { userId: adminA, schoolId: schoolA, role: 'admin' })
    const res = await app.inject({
      method: 'GET',
      url: `/classes/${classA}/attendance?date=2026-05-13`,
      headers: { authorization: `Bearer ${t}` },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json() as { classId: string; date: string; rows: Array<{ studentId: string; record: { status: string } | null }> }
    expect(body.classId).toBe(classA)
    expect(body.date).toBe('2026-05-13')
    expect(body.rows).toHaveLength(1)
    expect(body.rows[0]?.studentId).toBe(studentA)
    expect(body.rows[0]?.record?.status).toBe('present')
  })

  it('returns 404 when admin of school A fetches class of school B', async () => {
    const { schoolA, adminA, classB } = await seedTwoSchools()
    const t = token(app, { userId: adminA, schoolId: schoolA, role: 'admin' })
    const res = await app.inject({
      method: 'GET',
      url: `/classes/${classB}/attendance?date=2026-05-13`,
      headers: { authorization: `Bearer ${t}` },
    })
    expect(res.statusCode).toBe(404)
  })
})
