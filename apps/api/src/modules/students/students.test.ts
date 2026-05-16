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

async function seedTwoSchools() {
  const schoolA = newId()
  const schoolB = newId()
  const teacherA = newId()
  const teacherB = newId()
  await db.insert(schools).values([
    { id: schoolA, name: 'A', address: 'a', startTime: '07:45', endTime: '13:30', lateThresholdMinutes: 10, absentThresholdMinutes: 30 },
    { id: schoolB, name: 'B', address: 'b', startTime: '07:45', endTime: '13:30', lateThresholdMinutes: 10, absentThresholdMinutes: 30 },
  ])
  await db.insert(users).values([
    { id: teacherA, schoolId: schoolA, role: 'teacher', fullName: 'TA', phone: '+923001200090', preferredLanguage: 'en' },
    { id: teacherB, schoolId: schoolB, role: 'teacher', fullName: 'TB', phone: '+923001200091', preferredLanguage: 'en' },
  ])
  const classA = newId()
  const classB = newId()
  await db.insert(classes).values([
    { id: classA, schoolId: schoolA, name: 'CA', teacherId: teacherA },
    { id: classB, schoolId: schoolB, name: 'CB', teacherId: teacherB },
  ])
  const adminA = newId()
  await db.insert(users).values({
    id: adminA, schoolId: schoolA, role: 'admin', fullName: 'AdminA', phone: '+923001100090', preferredLanguage: 'en',
  })
  const studentA = newId()
  const studentB = newId()
  await db.insert(students).values([
    { id: studentA, schoolId: schoolA, classId: classA, fullName: 'SA', rollNumber: '001', status: 'active' },
    { id: studentB, schoolId: schoolB, classId: classB, fullName: 'SB', rollNumber: '001', status: 'active' },
  ])
  return { schoolA, schoolB, adminA, studentA, studentB }
}

function token(app: FastifyInstance, payload: { userId: string; schoolId: string; role: 'parent' | 'admin' | 'teacher' }) {
  return app.jwt.sign(payload, { expiresIn: '1h' })
}

describe('GET /students', () => {
  it('returns only students from the caller\'s school', async () => {
    const { schoolA, adminA, studentA } = await seedTwoSchools()
    const t = token(app, { userId: adminA, schoolId: schoolA, role: 'admin' })
    const res = await app.inject({
      method: 'GET',
      url: '/students',
      headers: { authorization: `Bearer ${t}` },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json() as Array<{ id: string }>
    expect(body.map((s) => s.id)).toEqual([studentA])
  })

  it('returns 404 when admin of school A fetches student of school B', async () => {
    const { schoolA, adminA, studentB } = await seedTwoSchools()
    const t = token(app, { userId: adminA, schoolId: schoolA, role: 'admin' })
    const res = await app.inject({
      method: 'GET',
      url: `/students/${studentB}`,
      headers: { authorization: `Bearer ${t}` },
    })
    expect(res.statusCode).toBe(404)
  })

  it('GET /students/:id/timeline returns records within range ordered by date', async () => {
    const { schoolA, adminA, studentA } = await seedTwoSchools()
    await db.insert(attendanceRecords).values([
      { id: newId(), schoolId: schoolA, studentId: studentA, date: '2026-05-11', status: 'present', isManual: false },
      { id: newId(), schoolId: schoolA, studentId: studentA, date: '2026-05-12', status: 'late', isManual: false },
      { id: newId(), schoolId: schoolA, studentId: studentA, date: '2026-05-15', status: 'present', isManual: false },
    ])
    const t = token(app, { userId: adminA, schoolId: schoolA, role: 'admin' })
    const res = await app.inject({
      method: 'GET',
      url: `/students/${studentA}/timeline?from=2026-05-11&to=2026-05-13`,
      headers: { authorization: `Bearer ${t}` },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json() as Array<{ date: string; status: string }>
    expect(body.map((r) => r.date)).toEqual(['2026-05-11', '2026-05-12'])
  })

  // --- cursor pagination ---

  async function seedExtraStudents(schoolId: string, classId: string, n: number) {
    const ids: string[] = []
    for (let i = 0; i < n; i++) {
      const id = newId()
      ids.push(id)
      await db.insert(students).values({
        id,
        schoolId,
        classId,
        fullName: `Extra${i}`,
        rollNumber: `E${i}`,
        status: 'active',
      })
    }
    return ids
  }

  it('GET /students?limit=2 returns the 2 newest with X-Next-Cursor', async () => {
    const { schoolA, adminA } = await seedTwoSchools()
    // seedTwoSchools created studentA already; add a class for extras.
    const classRows = await db.select().from(classes).where(eq(classes.schoolId, schoolA)).limit(1)
    const classA = classRows[0]!.id
    const extras = await seedExtraStudents(schoolA, classA, 3)
    const t = token(app, { userId: adminA, schoolId: schoolA, role: 'admin' })
    const res = await app.inject({
      method: 'GET',
      url: '/students?limit=2',
      headers: { authorization: `Bearer ${t}` },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json() as Array<{ id: string }>
    expect(body).toHaveLength(2)
    expect(body[0]!.id).toBe(extras[2])
    expect(body[1]!.id).toBe(extras[1])
    expect(res.headers['x-next-cursor']).toBe(extras[1])
  })

  it('GET /students?cursor=<id> returns next page (short page omits cursor)', async () => {
    const { schoolA, adminA, studentA } = await seedTwoSchools()
    const classRows = await db.select().from(classes).where(eq(classes.schoolId, schoolA)).limit(1)
    const classA = classRows[0]!.id
    const extras = await seedExtraStudents(schoolA, classA, 3)
    const t = token(app, { userId: adminA, schoolId: schoolA, role: 'admin' })
    // Newest-first id order: extras[2], extras[1], extras[0], studentA
    // limit=3, cursor at extras[1] → only extras[0], studentA remain → short page
    const res = await app.inject({
      method: 'GET',
      url: `/students?limit=3&cursor=${extras[1]}`,
      headers: { authorization: `Bearer ${t}` },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json() as Array<{ id: string }>
    expect(body).toHaveLength(2)
    expect(body[0]!.id).toBe(extras[0])
    expect(body[1]!.id).toBe(studentA)
    expect(res.headers['x-next-cursor']).toBeUndefined()
  })

  it('parent gets 404 on timeline of a student they do not guard', async () => {
    const { schoolA, studentA } = await seedTwoSchools()
    // Add a parent in school A who is NOT a guardian of studentA
    const parentId = newId()
    await db.insert(users).values({
      id: parentId, schoolId: schoolA, role: 'parent',
      fullName: 'NonGuardianParent', phone: '+923001000080', preferredLanguage: 'en',
    })
    const t = token(app, { userId: parentId, schoolId: schoolA, role: 'parent' })
    const res = await app.inject({
      method: 'GET',
      url: `/students/${studentA}/timeline?from=2026-05-11&to=2026-05-13`,
      headers: { authorization: `Bearer ${t}` },
    })
    expect(res.statusCode).toBe(404)
  })
})
