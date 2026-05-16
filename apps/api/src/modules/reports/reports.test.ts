import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { and, eq } from 'drizzle-orm'
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
  const adminA = newId()
  const classA = newId()
  const classB = newId()
  const studentA = newId()
  const studentB = newId()
  await db.insert(schools).values([
    { id: schoolA, name: 'A', address: 'a', startTime: '07:45', endTime: '13:30', lateThresholdMinutes: 10, absentThresholdMinutes: 30 },
    { id: schoolB, name: 'B', address: 'b', startTime: '07:45', endTime: '13:30', lateThresholdMinutes: 10, absentThresholdMinutes: 30 },
  ])
  await db.insert(users).values([
    { id: teacherA, schoolId: schoolA, role: 'teacher', fullName: 'TA', phone: '+923001200090', preferredLanguage: 'en' },
    { id: teacherB, schoolId: schoolB, role: 'teacher', fullName: 'TB', phone: '+923001200091', preferredLanguage: 'en' },
    { id: adminA, schoolId: schoolA, role: 'admin', fullName: 'AA', phone: '+923001100090', preferredLanguage: 'en' },
  ])
  await db.insert(classes).values([
    { id: classA, schoolId: schoolA, name: 'Grade 1A', teacherId: teacherA },
    { id: classB, schoolId: schoolB, name: 'Grade 1B', teacherId: teacherB },
  ])
  await db.insert(students).values([
    { id: studentA, schoolId: schoolA, classId: classA, fullName: 'StudentA', rollNumber: '001', status: 'active' },
    { id: studentB, schoolId: schoolB, classId: classB, fullName: 'StudentB', rollNumber: '001', status: 'active' },
  ])
  await db.insert(attendanceRecords).values([
    { id: newId(), schoolId: schoolA, studentId: studentA, date: '2026-05-13', firstInAt: new Date('2026-05-13T02:48:00Z'), status: 'present', isManual: false },
    { id: newId(), schoolId: schoolB, studentId: studentB, date: '2026-05-13', status: 'present', isManual: false },
  ])
  return { schoolA, schoolB, adminA, classA, classB, studentA, studentB }
}

function token(app: FastifyInstance, payload: { userId: string; schoolId: string; role: 'parent' | 'admin' | 'teacher' }) {
  return app.jwt.sign(payload, { expiresIn: '1h' })
}

describe('reports routes', () => {
  it('GET /attendance?date= returns the day records scoped to school', async () => {
    const { schoolA, adminA, studentA } = await seedTwoSchools()
    const t = token(app, { userId: adminA, schoolId: schoolA, role: 'admin' })
    const res = await app.inject({
      method: 'GET',
      url: '/attendance?date=2026-05-13',
      headers: { authorization: `Bearer ${t}` },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json() as Array<{ studentId: string; date: string }>
    expect(body.map((r) => r.studentId)).toEqual([studentA])
    expect(body[0]?.date).toBe('2026-05-13')
  })

  it('GET /attendance without date or from/to → 400', async () => {
    const { schoolA, adminA } = await seedTwoSchools()
    const t = token(app, { userId: adminA, schoolId: schoolA, role: 'admin' })
    const res = await app.inject({
      method: 'GET',
      url: '/attendance',
      headers: { authorization: `Bearer ${t}` },
    })
    expect(res.statusCode).toBe(400)
  })

  it('GET /attendance with cross-tenant classId returns 404', async () => {
    const { schoolA, adminA, classB } = await seedTwoSchools()
    const t = token(app, { userId: adminA, schoolId: schoolA, role: 'admin' })
    const res = await app.inject({
      method: 'GET',
      url: `/attendance?date=2026-05-13&classId=${classB}`,
      headers: { authorization: `Bearer ${t}` },
    })
    expect(res.statusCode).toBe(404)
  })

  it('GET /attendance surfaces cardAnomaly=true and omits the other two flags', async () => {
    const { schoolA, adminA, studentA } = await seedTwoSchools()
    // Flip the default row to cardAnomaly=true; leftWithoutScan/flaggedForReview stay false.
    await db
      .update(attendanceRecords)
      .set({ cardAnomaly: true })
      .where(
        and(eq(attendanceRecords.schoolId, schoolA), eq(attendanceRecords.studentId, studentA)),
      )
    const t = token(app, { userId: adminA, schoolId: schoolA, role: 'admin' })
    const res = await app.inject({
      method: 'GET',
      url: '/attendance?date=2026-05-13',
      headers: { authorization: `Bearer ${t}` },
    })
    expect(res.statusCode).toBe(200)
    // Parse raw payload to verify omitted keys aren't merely undefined but absent.
    const parsed = JSON.parse(res.payload) as Array<Record<string, unknown>>
    expect(parsed).toHaveLength(1)
    const row = parsed[0]!
    expect(row.cardAnomaly).toBe(true)
    expect('leftWithoutScan' in row).toBe(false)
    expect('flaggedForReview' in row).toBe(false)
  })

  it('GET /attendance default row JSON contains none of the anomaly keys', async () => {
    const { schoolA, adminA } = await seedTwoSchools()
    const t = token(app, { userId: adminA, schoolId: schoolA, role: 'admin' })
    const res = await app.inject({
      method: 'GET',
      url: '/attendance?date=2026-05-13',
      headers: { authorization: `Bearer ${t}` },
    })
    expect(res.statusCode).toBe(200)
    const parsed = JSON.parse(res.payload) as Array<Record<string, unknown>>
    expect(parsed).toHaveLength(1)
    const row = parsed[0]!
    expect('cardAnomaly' in row).toBe(false)
    expect('leftWithoutScan' in row).toBe(false)
    expect('flaggedForReview' in row).toBe(false)
  })

  it('GET /attendance?anomalies=true returns only the flagged row', async () => {
    const { schoolA, adminA, studentA, classA } = await seedTwoSchools()
    // Add a second student + a flagged attendance row alongside the default
    // (unflagged) one seeded by seedTwoSchools.
    const flaggedStudent = newId()
    await db.insert(students).values([
      {
        id: flaggedStudent,
        schoolId: schoolA,
        classId: classA,
        fullName: 'FlaggedStudent',
        rollNumber: '002',
        status: 'active',
      },
    ])
    const flaggedRowId = newId()
    await db.insert(attendanceRecords).values([
      {
        id: flaggedRowId,
        schoolId: schoolA,
        studentId: flaggedStudent,
        date: '2026-05-13',
        status: 'present',
        isManual: false,
        flaggedForReview: true,
      },
    ])
    const t = token(app, { userId: adminA, schoolId: schoolA, role: 'admin' })
    const res = await app.inject({
      method: 'GET',
      url: '/attendance?date=2026-05-13&anomalies=true',
      headers: { authorization: `Bearer ${t}` },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json() as Array<{ id: string; studentId: string; flaggedForReview?: boolean }>
    expect(body).toHaveLength(1)
    expect(body[0]?.id).toBe(flaggedRowId)
    expect(body[0]?.studentId).toBe(flaggedStudent)
    expect(body[0]?.flaggedForReview).toBe(true)
    // Sanity: the unflagged default row for studentA is NOT in the result.
    expect(body.map((r) => r.studentId)).not.toContain(studentA)
  })

  it('GET /reports/attendance.csv returns proper headers + headers row', async () => {
    const { schoolA, adminA } = await seedTwoSchools()
    const t = token(app, { userId: adminA, schoolId: schoolA, role: 'admin' })
    const res = await app.inject({
      method: 'GET',
      url: '/reports/attendance.csv?from=2026-05-13&to=2026-05-13',
      headers: { authorization: `Bearer ${t}` },
    })
    expect(res.statusCode).toBe(200)
    expect(res.headers['content-type']).toContain('text/csv')
    expect(res.headers['content-disposition']).toContain('attendance_2026-05-13_2026-05-13.csv')
    const lines = res.payload.split('\n').filter(Boolean)
    expect(lines[0]).toBe('Date,Class,Student,Roll #,Status,First In (Karachi),Last Out (Karachi),Manual')
    expect(lines).toHaveLength(2)
    expect(lines[1]).toContain('07:48')
  })
})
