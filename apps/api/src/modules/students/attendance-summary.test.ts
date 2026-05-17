import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../../app.js'
import { truncateAll } from '../../../tests/helpers/db.js'
import { db } from '../../db/client.js'
import { schools, classes } from '../../db/schema/schools.js'
import { users } from '../../db/schema/auth.js'
import { students, studentGuardians } from '../../db/schema/students.js'
import { attendanceRecords } from '../../db/schema/attendance.js'
import { newId } from '../../lib/ids.js'
import { studentAttendanceSummarySchema } from '@fyntra/schemas'

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
  const schoolA = newId()
  const schoolB = newId()
  const teacherA = newId()
  const teacherB = newId()
  const adminA = newId()
  const parentA = newId()
  const otherParentA = newId()
  const classA = newId()
  const classB = newId()
  const studentA1 = newId()
  const studentA2 = newId()
  await db.insert(schools).values([
    { id: schoolA, name: 'A', address: 'a', startTime: '07:45', endTime: '13:30', lateThresholdMinutes: 10, absentThresholdMinutes: 30 },
    { id: schoolB, name: 'B', address: 'b', startTime: '07:45', endTime: '13:30', lateThresholdMinutes: 10, absentThresholdMinutes: 30 },
  ])
  await db.insert(users).values([
    { id: teacherA, schoolId: schoolA, role: 'teacher', fullName: 'TA', phone: '+923001200090', preferredLanguage: 'en' },
    { id: teacherB, schoolId: schoolA, role: 'teacher', fullName: 'TB-otherclass', phone: '+923001200091', preferredLanguage: 'en' },
    { id: adminA, schoolId: schoolA, role: 'admin', fullName: 'AdminA', phone: '+923001100090', preferredLanguage: 'en' },
    { id: parentA, schoolId: schoolA, role: 'parent', fullName: 'ParentA', phone: '+923001000090', preferredLanguage: 'en' },
    { id: otherParentA, schoolId: schoolA, role: 'parent', fullName: 'ParentOther', phone: '+923001000091', preferredLanguage: 'en' },
  ])
  await db.insert(classes).values([
    { id: classA, schoolId: schoolA, name: 'CA', teacherId: teacherA },
    { id: classB, schoolId: schoolA, name: 'CB', teacherId: teacherB },
  ])
  await db.insert(students).values([
    { id: studentA1, schoolId: schoolA, classId: classA, fullName: 'Ahmad', rollNumber: '001', status: 'active' },
    { id: studentA2, schoolId: schoolA, classId: classB, fullName: 'Bilal', rollNumber: '002', status: 'active' },
  ])
  await db.insert(studentGuardians).values({
    studentId: studentA1, userId: parentA, schoolId: schoolA, relationship: 'father',
  })
  return { schoolA, schoolB, teacherA, teacherB, adminA, parentA, otherParentA, classA, classB, studentA1, studentA2 }
}

function token(app: FastifyInstance, payload: { userId: string; schoolId: string; role: 'parent' | 'admin' | 'teacher' }) {
  return app.jwt.sign(payload, { expiresIn: '1h' })
}

describe('GET /students/:id/attendance-summary', () => {
  it('admin sees a valid month+year summary for a student', async () => {
    const { schoolA, adminA, studentA1 } = await seed()
    await db.insert(attendanceRecords).values([
      { id: newId(), schoolId: schoolA, studentId: studentA1, date: '2026-05-04', status: 'present', isManual: false },
      { id: newId(), schoolId: schoolA, studentId: studentA1, date: '2026-05-05', status: 'late', isManual: false },
      { id: newId(), schoolId: schoolA, studentId: studentA1, date: '2026-05-06', status: 'absent', isManual: false },
    ])
    const t = token(app, { userId: adminA, schoolId: schoolA, role: 'admin' })
    const res = await app.inject({
      method: 'GET',
      url: `/students/${studentA1}/attendance-summary?month=2026-05`,
      headers: { authorization: `Bearer ${t}` },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(() => studentAttendanceSummarySchema.parse(body)).not.toThrow()
    const parsed = studentAttendanceSummarySchema.parse(body)
    expect(parsed.studentId).toBe(studentA1)
    expect(parsed.month.period).toBe('2026-05')
    expect(parsed.month.counts.present).toBe(1)
    expect(parsed.month.counts.late).toBe(1)
    expect(parsed.month.counts.absent).toBe(1)
  })

  it('parent of student can fetch summary', async () => {
    const { schoolA, parentA, studentA1 } = await seed()
    const t = token(app, { userId: parentA, schoolId: schoolA, role: 'parent' })
    const res = await app.inject({
      method: 'GET',
      url: `/students/${studentA1}/attendance-summary?month=2026-05`,
      headers: { authorization: `Bearer ${t}` },
    })
    expect(res.statusCode).toBe(200)
  })

  it('parent of a different student gets 403', async () => {
    const { schoolA, otherParentA, studentA1 } = await seed()
    const t = token(app, { userId: otherParentA, schoolId: schoolA, role: 'parent' })
    const res = await app.inject({
      method: 'GET',
      url: `/students/${studentA1}/attendance-summary?month=2026-05`,
      headers: { authorization: `Bearer ${t}` },
    })
    expect(res.statusCode).toBe(403)
  })

  it("teacher of student's class can fetch the summary", async () => {
    const { schoolA, teacherA, studentA1 } = await seed()
    const t = token(app, { userId: teacherA, schoolId: schoolA, role: 'teacher' })
    const res = await app.inject({
      method: 'GET',
      url: `/students/${studentA1}/attendance-summary?month=2026-05`,
      headers: { authorization: `Bearer ${t}` },
    })
    expect(res.statusCode).toBe(200)
  })

  it("teacher of a different class gets 403", async () => {
    const { schoolA, teacherB, studentA1 } = await seed()
    const t = token(app, { userId: teacherB, schoolId: schoolA, role: 'teacher' })
    const res = await app.inject({
      method: 'GET',
      url: `/students/${studentA1}/attendance-summary?month=2026-05`,
      headers: { authorization: `Bearer ${t}` },
    })
    expect(res.statusCode).toBe(403)
  })

  it('cross-tenant: 404 when student is in another school', async () => {
    const { schoolB, adminA, studentA1 } = await seed()
    // adminA is in schoolA, studentA1 is in schoolA — synthesize a cross-tenant
    // by minting a token for schoolB.
    const fakeAdminId = newId()
    await db.insert(users).values({
      id: fakeAdminId, schoolId: schoolB, role: 'admin', fullName: 'AdminB', phone: '+923001100099', preferredLanguage: 'en',
    })
    const t = token(app, { userId: fakeAdminId, schoolId: schoolB, role: 'admin' })
    const res = await app.inject({
      method: 'GET',
      url: `/students/${studentA1}/attendance-summary?month=2026-05`,
      headers: { authorization: `Bearer ${t}` },
    })
    expect(res.statusCode).toBe(404)
    void adminA
  })

  it('attendancePct math: (present + late + halfDay*0.5) / workingDays * 100', async () => {
    const { schoolA, adminA, studentA1 } = await seed()
    await db.insert(attendanceRecords).values([
      { id: newId(), schoolId: schoolA, studentId: studentA1, date: '2026-05-04', status: 'present', isManual: false },
      { id: newId(), schoolId: schoolA, studentId: studentA1, date: '2026-05-05', status: 'present', isManual: false },
      { id: newId(), schoolId: schoolA, studentId: studentA1, date: '2026-05-06', status: 'late', isManual: false },
      { id: newId(), schoolId: schoolA, studentId: studentA1, date: '2026-05-07', status: 'half_day', isManual: false },
    ])
    const t = token(app, { userId: adminA, schoolId: schoolA, role: 'admin' })
    const res = await app.inject({
      method: 'GET',
      url: `/students/${studentA1}/attendance-summary?month=2026-05`,
      headers: { authorization: `Bearer ${t}` },
    })
    expect(res.statusCode).toBe(200)
    const parsed = studentAttendanceSummarySchema.parse(res.json())
    // 21 weekdays in May 2026. (2 + 1 + 0 + 0.5) / 21 * 100 ≈ 16.7
    expect(parsed.month.counts.attendancePct).not.toBeNull()
    expect(parsed.month.counts.attendancePct).toBeCloseTo((3.5 / 21) * 100, 1)
  })

  it('defaults: month falls back to current Karachi month when query is omitted', async () => {
    const { schoolA, adminA, studentA1 } = await seed()
    const t = token(app, { userId: adminA, schoolId: schoolA, role: 'admin' })
    const res = await app.inject({
      method: 'GET',
      url: `/students/${studentA1}/attendance-summary`,
      headers: { authorization: `Bearer ${t}` },
    })
    expect(res.statusCode).toBe(200)
    const parsed = studentAttendanceSummarySchema.parse(res.json())
    expect(parsed.month.period).toMatch(/^\d{4}-\d{2}$/)
  })
})
