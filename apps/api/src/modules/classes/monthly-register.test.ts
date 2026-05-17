import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../../app.js'
import { truncateAll } from '../../../tests/helpers/db.js'
import { db } from '../../db/client.js'
import { schools, classes } from '../../db/schema/schools.js'
import { users } from '../../db/schema/auth.js'
import { students } from '../../db/schema/students.js'
import { attendanceRecords } from '../../db/schema/attendance.js'
import { schoolHolidays } from '../../db/schema/holidays.js'
import { newId } from '../../lib/ids.js'
import { classRegisterResponseSchema } from '@fyntra/schemas'

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

async function seedSchools() {
  const schoolA = newId()
  const schoolB = newId()
  const teacherA = newId()
  const adminA = newId()
  const parentA = newId()
  const classA = newId()
  const classB = newId()
  const teacherB = newId()
  const sA1 = newId()
  const sA2 = newId()
  await db.insert(schools).values([
    { id: schoolA, name: 'A', address: 'a', startTime: '07:45', endTime: '13:30', lateThresholdMinutes: 10, absentThresholdMinutes: 30 },
    { id: schoolB, name: 'B', address: 'b', startTime: '07:45', endTime: '13:30', lateThresholdMinutes: 10, absentThresholdMinutes: 30 },
  ])
  await db.insert(users).values([
    { id: teacherA, schoolId: schoolA, role: 'teacher', fullName: 'TA', phone: '+923001200090', preferredLanguage: 'en' },
    { id: teacherB, schoolId: schoolB, role: 'teacher', fullName: 'TB', phone: '+923001200091', preferredLanguage: 'en' },
    { id: adminA, schoolId: schoolA, role: 'admin', fullName: 'AdminA', phone: '+923001100090', preferredLanguage: 'en' },
    { id: parentA, schoolId: schoolA, role: 'parent', fullName: 'ParentA', phone: '+923001000090', preferredLanguage: 'en' },
  ])
  await db.insert(classes).values([
    { id: classA, schoolId: schoolA, name: 'CA', teacherId: teacherA },
    { id: classB, schoolId: schoolB, name: 'CB', teacherId: teacherB },
  ])
  await db.insert(students).values([
    { id: sA1, schoolId: schoolA, classId: classA, fullName: 'Ahmad', rollNumber: '001', status: 'active' },
    { id: sA2, schoolId: schoolA, classId: classA, fullName: 'Bilal', rollNumber: '002', status: 'active' },
  ])
  return { schoolA, schoolB, classA, classB, teacherA, adminA, parentA, sA1, sA2 }
}

function token(app: FastifyInstance, payload: { userId: string; schoolId: string; role: 'parent' | 'admin' | 'teacher' }) {
  return app.jwt.sign(payload, { expiresIn: '1h' })
}

describe('GET /classes/:id/register?month=YYYY-MM', () => {
  it('returns the composed monthly payload (class + days + students + records + summaries)', async () => {
    const { schoolA, classA, teacherA, sA1, sA2 } = await seedSchools()
    // Seed some records inside May 2026.
    await db.insert(attendanceRecords).values([
      { id: newId(), schoolId: schoolA, studentId: sA1, date: '2026-05-04', status: 'present', isManual: false, firstInAt: new Date('2026-05-04T02:48:00Z') },
      { id: newId(), schoolId: schoolA, studentId: sA1, date: '2026-05-05', status: 'late', isManual: false, firstInAt: new Date('2026-05-05T03:30:00Z') },
      { id: newId(), schoolId: schoolA, studentId: sA2, date: '2026-05-04', status: 'absent', isManual: false },
    ])
    const t = token(app, { userId: teacherA, schoolId: schoolA, role: 'teacher' })
    const res = await app.inject({
      method: 'GET',
      url: `/classes/${classA}/register?month=2026-05`,
      headers: { authorization: `Bearer ${t}` },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(() => classRegisterResponseSchema.parse(body)).not.toThrow()

    const parsed = classRegisterResponseSchema.parse(body)
    expect(parsed.class.id).toBe(classA)
    expect(parsed.month).toBe('2026-05')
    expect(parsed.days).toHaveLength(31) // May has 31 days
    expect(parsed.students.map((s) => s.rollNumber).sort()).toEqual(['001', '002'])
    expect(parsed.records).toHaveLength(3)
    // Per-student summary entries
    expect(parsed.summaries).toHaveLength(2)
    const ahmad = parsed.summaries.find((s) => s.studentId === sA1)!
    expect(ahmad.present).toBe(1)
    expect(ahmad.late).toBe(1)
    expect(ahmad.absent).toBe(0)
    const bilal = parsed.summaries.find((s) => s.studentId === sA2)!
    expect(bilal.absent).toBe(1)
    expect(bilal.present).toBe(0)
  })

  it('marks weekend days as non-working and counts only working days in the denominator', async () => {
    const { schoolA, classA, teacherA, sA1 } = await seedSchools()
    const t = token(app, { userId: teacherA, schoolId: schoolA, role: 'teacher' })
    const res = await app.inject({
      method: 'GET',
      url: `/classes/${classA}/register?month=2026-05`,
      headers: { authorization: `Bearer ${t}` },
    })
    expect(res.statusCode).toBe(200)
    const parsed = classRegisterResponseSchema.parse(res.json())

    // May 2026: 1st = Friday, so weekdays: mon-fri are working, sat-sun off.
    const sundays = parsed.days.filter((d) => d.weekday === 'sun')
    expect(sundays.every((d) => !d.isWorkingDay)).toBe(true)
    const mondays = parsed.days.filter((d) => d.weekday === 'mon')
    expect(mondays.every((d) => d.isWorkingDay)).toBe(true)

    // Working days count = mondays..fridays minus any holidays.
    const ahmad = parsed.summaries.find((s) => s.studentId === sA1)!
    const workingDayCount = parsed.days.filter((d) => d.isWorkingDay).length
    expect(ahmad.workingDays).toBe(workingDayCount)
  })

  it('closed/exam holidays reduce isWorkingDay and the working-days denominator', async () => {
    const { schoolA, classA, teacherA, adminA, sA1 } = await seedSchools()
    void adminA
    await db.insert(schoolHolidays).values([
      { id: newId(), schoolId: schoolA, date: '2026-05-04', label: 'Test holiday', kind: 'closed' },
      { id: newId(), schoolId: schoolA, date: '2026-05-05', label: 'Maths paper', kind: 'exam' },
      // half_day does NOT reduce the working-day denominator.
      { id: newId(), schoolId: schoolA, date: '2026-05-06', label: 'Half-day Wed', kind: 'half_day', effectiveEndTime: '12:00' },
    ])
    const t = token(app, { userId: teacherA, schoolId: schoolA, role: 'teacher' })
    const res = await app.inject({
      method: 'GET',
      url: `/classes/${classA}/register?month=2026-05`,
      headers: { authorization: `Bearer ${t}` },
    })
    expect(res.statusCode).toBe(200)
    const parsed = classRegisterResponseSchema.parse(res.json())

    const may4 = parsed.days.find((d) => d.date === '2026-05-04')!
    const may5 = parsed.days.find((d) => d.date === '2026-05-05')!
    const may6 = parsed.days.find((d) => d.date === '2026-05-06')!
    expect(may4.isWorkingDay).toBe(false)
    expect(may4.holiday?.kind).toBe('closed')
    expect(may5.isWorkingDay).toBe(false)
    expect(may5.holiday?.kind).toBe('exam')
    expect(may6.isWorkingDay).toBe(true) // half-day still a working day
    expect(may6.holiday?.kind).toBe('half_day')

    const ahmad = parsed.summaries.find((s) => s.studentId === sA1)!
    // May 2026 weekdays: 21. Minus 2 closed/exam = 19.
    expect(ahmad.workingDays).toBe(19)
  })

  it('attendance % uses (present + late + excused + halfDay*0.5) / workingDays * 100', async () => {
    const { schoolA, classA, teacherA, sA1 } = await seedSchools()
    // Seed: 2 present, 1 late, 1 half_day, 1 absent across 5 working days.
    await db.insert(attendanceRecords).values([
      { id: newId(), schoolId: schoolA, studentId: sA1, date: '2026-05-04', status: 'present', isManual: false },
      { id: newId(), schoolId: schoolA, studentId: sA1, date: '2026-05-05', status: 'present', isManual: false },
      { id: newId(), schoolId: schoolA, studentId: sA1, date: '2026-05-06', status: 'late', isManual: false },
      { id: newId(), schoolId: schoolA, studentId: sA1, date: '2026-05-07', status: 'half_day', isManual: false },
      { id: newId(), schoolId: schoolA, studentId: sA1, date: '2026-05-08', status: 'absent', isManual: false },
    ])
    // Make a closed-holiday month so working_days is just our 5 dates.
    // (May 2026 has 21 weekdays; the rest are absent records or no record.)
    const t = token(app, { userId: teacherA, schoolId: schoolA, role: 'teacher' })
    const res = await app.inject({
      method: 'GET',
      url: `/classes/${classA}/register?month=2026-05`,
      headers: { authorization: `Bearer ${t}` },
    })
    expect(res.statusCode).toBe(200)
    const parsed = classRegisterResponseSchema.parse(res.json())
    const ahmad = parsed.summaries.find((s) => s.studentId === sA1)!
    expect(ahmad.present).toBe(2)
    expect(ahmad.late).toBe(1)
    expect(ahmad.halfDay).toBe(1)
    expect(ahmad.absent).toBe(1)
    // attendancePct = (2 + 1 + 0 + 0.5) / 21 * 100 = ~16.67
    expect(ahmad.attendancePct).not.toBeNull()
    expect(ahmad.attendancePct).toBeCloseTo((3.5 / 21) * 100, 1)
  })

  it('parent gets 403 (only teacher-of-class + admin)', async () => {
    const { schoolA, classA, parentA } = await seedSchools()
    const t = token(app, { userId: parentA, schoolId: schoolA, role: 'parent' })
    const res = await app.inject({
      method: 'GET',
      url: `/classes/${classA}/register?month=2026-05`,
      headers: { authorization: `Bearer ${t}` },
    })
    expect(res.statusCode).toBe(403)
  })

  it('cross-tenant: admin of A reading class of B → 404', async () => {
    const { schoolA, classB, adminA } = await seedSchools()
    const t = token(app, { userId: adminA, schoolId: schoolA, role: 'admin' })
    const res = await app.inject({
      method: 'GET',
      url: `/classes/${classB}/register?month=2026-05`,
      headers: { authorization: `Bearer ${t}` },
    })
    expect(res.statusCode).toBe(404)
  })

  it('rejects malformed month (400)', async () => {
    const { schoolA, classA, teacherA } = await seedSchools()
    const t = token(app, { userId: teacherA, schoolId: schoolA, role: 'teacher' })
    const res = await app.inject({
      method: 'GET',
      url: `/classes/${classA}/register?month=May-2026`,
      headers: { authorization: `Bearer ${t}` },
    })
    expect(res.statusCode).toBe(400)
  })
})
