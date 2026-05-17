import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { eq } from 'drizzle-orm'
import { buildApp } from '../../app.js'
import { truncateAll } from '../../../tests/helpers/db.js'
import { db } from '../../db/client.js'
import { schools, classes } from '../../db/schema/schools.js'
import { users } from '../../db/schema/auth.js'
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
  const adminA = newId()
  const parentA = newId()
  const teacherA1 = newId()
  const teacherA2 = newId()
  const teacherB = newId()
  await db.insert(schools).values([
    { id: schoolA, name: 'A', address: 'a', startTime: '07:45', endTime: '13:30', lateThresholdMinutes: 10, absentThresholdMinutes: 30 },
    { id: schoolB, name: 'B', address: 'b', startTime: '07:45', endTime: '13:30', lateThresholdMinutes: 10, absentThresholdMinutes: 30 },
  ])
  await db.insert(users).values([
    { id: adminA, schoolId: schoolA, role: 'admin', fullName: 'AdminA', phone: '+923001300001', preferredLanguage: 'en' },
    { id: parentA, schoolId: schoolA, role: 'parent', fullName: 'ParentA', phone: '+923001300002', preferredLanguage: 'en' },
    { id: teacherA1, schoolId: schoolA, role: 'teacher', fullName: 'TeacherA1', phone: '+923001300003', preferredLanguage: 'en' },
    { id: teacherA2, schoolId: schoolA, role: 'teacher', fullName: 'TeacherA2', phone: '+923001300004', preferredLanguage: 'en' },
    { id: teacherB, schoolId: schoolB, role: 'teacher', fullName: 'TeacherB', phone: '+923001300005', preferredLanguage: 'en' },
  ])
  return { schoolA, schoolB, adminA, parentA, teacherA1, teacherA2, teacherB }
}

function token(app: FastifyInstance, payload: { userId: string; schoolId: string; role: 'parent' | 'admin' | 'teacher' }) {
  return app.jwt.sign(payload, { expiresIn: '1h' })
}

describe('POST /classes', () => {
  it('admin creates a class', async () => {
    const { schoolA, adminA, teacherA1 } = await seedTwoSchools()
    const t = token(app, { userId: adminA, schoolId: schoolA, role: 'admin' })
    const res = await app.inject({
      method: 'POST',
      url: '/classes',
      headers: { authorization: `Bearer ${t}` },
      payload: { name: 'Grade 3A', teacherId: teacherA1 },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json() as { id: string; name: string; teacherId: string; schoolId: string; studentCount?: number }
    expect(body.name).toBe('Grade 3A')
    expect(body.teacherId).toBe(teacherA1)
    expect(body.schoolId).toBe(schoolA)
    expect(body.studentCount).toBe(0)
    const rows = await db.select().from(classes).where(eq(classes.id, body.id))
    expect(rows).toHaveLength(1)
  })

  it('rejects non-admin', async () => {
    const { schoolA, parentA, teacherA1 } = await seedTwoSchools()
    const t = token(app, { userId: parentA, schoolId: schoolA, role: 'parent' })
    const res = await app.inject({
      method: 'POST',
      url: '/classes',
      headers: { authorization: `Bearer ${t}` },
      payload: { name: 'Grade 3A', teacherId: teacherA1 },
    })
    expect(res.statusCode).toBe(403)
  })

  it('rejects teacher in another school', async () => {
    const { schoolA, adminA, teacherB } = await seedTwoSchools()
    const t = token(app, { userId: adminA, schoolId: schoolA, role: 'admin' })
    const res = await app.inject({
      method: 'POST',
      url: '/classes',
      headers: { authorization: `Bearer ${t}` },
      payload: { name: 'Grade 3A', teacherId: teacherB },
    })
    expect(res.statusCode).toBe(400)
    expect(res.json()).toMatchObject({ code: 'TEACHER_NOT_ELIGIBLE' })
  })

  it('rejects user with role parent', async () => {
    const { schoolA, adminA, parentA } = await seedTwoSchools()
    const t = token(app, { userId: adminA, schoolId: schoolA, role: 'admin' })
    const res = await app.inject({
      method: 'POST',
      url: '/classes',
      headers: { authorization: `Bearer ${t}` },
      payload: { name: 'Grade 3A', teacherId: parentA },
    })
    expect(res.statusCode).toBe(400)
    expect(res.json()).toMatchObject({ code: 'TEACHER_NOT_ELIGIBLE' })
  })

  it('rejects duplicate name (case-insensitive)', async () => {
    const { schoolA, adminA, teacherA1, teacherA2 } = await seedTwoSchools()
    await db.insert(classes).values({ id: newId(), schoolId: schoolA, name: 'Grade 3A', teacherId: teacherA1 })
    const t = token(app, { userId: adminA, schoolId: schoolA, role: 'admin' })
    const res = await app.inject({
      method: 'POST',
      url: '/classes',
      headers: { authorization: `Bearer ${t}` },
      payload: { name: 'grade 3a', teacherId: teacherA2 },
    })
    expect(res.statusCode).toBe(409)
    expect(res.json()).toMatchObject({ code: 'CLASS_NAME_TAKEN' })
  })

  it('rejects duplicate teacher assignment', async () => {
    const { schoolA, adminA, teacherA1 } = await seedTwoSchools()
    await db.insert(classes).values({ id: newId(), schoolId: schoolA, name: 'Existing', teacherId: teacherA1 })
    const t = token(app, { userId: adminA, schoolId: schoolA, role: 'admin' })
    const res = await app.inject({
      method: 'POST',
      url: '/classes',
      headers: { authorization: `Bearer ${t}` },
      payload: { name: 'Grade 3A', teacherId: teacherA1 },
    })
    expect(res.statusCode).toBe(409)
    expect(res.json()).toMatchObject({ code: 'TEACHER_ALREADY_ASSIGNED' })
  })
})
