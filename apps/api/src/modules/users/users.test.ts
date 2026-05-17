import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../../app.js'
import { truncateAll } from '../../../tests/helpers/db.js'
import { db } from '../../db/client.js'
import { schools } from '../../db/schema/schools.js'
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

async function seed() {
  const schoolA = newId()
  const schoolB = newId()
  const adminA = newId()
  const parentA = newId()
  const teacherA = newId()
  const teacher2A = newId()
  const teacherB = newId()
  await db.insert(schools).values([
    { id: schoolA, name: 'A', address: 'a', startTime: '07:45', endTime: '13:30', lateThresholdMinutes: 10, absentThresholdMinutes: 30 },
    { id: schoolB, name: 'B', address: 'b', startTime: '07:45', endTime: '13:30', lateThresholdMinutes: 10, absentThresholdMinutes: 30 },
  ])
  await db.insert(users).values([
    { id: adminA, schoolId: schoolA, role: 'admin', fullName: 'AdminA', phone: '+923001400001', preferredLanguage: 'en' },
    { id: parentA, schoolId: schoolA, role: 'parent', fullName: 'ParentA', phone: '+923001400002', preferredLanguage: 'en' },
    { id: teacherA, schoolId: schoolA, role: 'teacher', fullName: 'Zara Iqbal', phone: '+923001400003', preferredLanguage: 'en' },
    { id: teacher2A, schoolId: schoolA, role: 'teacher', fullName: 'Ahmed Khan', phone: '+923001400004', preferredLanguage: 'en' },
    { id: teacherB, schoolId: schoolB, role: 'teacher', fullName: 'TeacherB', phone: '+923001400005', preferredLanguage: 'en' },
  ])
  return { schoolA, schoolB, adminA, parentA, teacherA, teacher2A, teacherB }
}

function token(app: FastifyInstance, payload: { userId: string; schoolId: string; role: 'parent' | 'admin' | 'teacher' }) {
  return app.jwt.sign(payload, { expiresIn: '1h' })
}

describe('GET /users?role=teacher', () => {
  it('admin lists teachers in their school only, sorted by fullName', async () => {
    const { schoolA, adminA } = await seed()
    const t = token(app, { userId: adminA, schoolId: schoolA, role: 'admin' })
    const res = await app.inject({
      method: 'GET',
      url: '/users?role=teacher',
      headers: { authorization: `Bearer ${t}` },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json() as Array<{ id: string; fullName: string }>
    expect(body).toHaveLength(2)
    expect(body.map((u) => u.fullName)).toEqual(['Ahmed Khan', 'Zara Iqbal'])
    expect(body.every((u) => typeof u.id === 'string')).toBe(true)
  })

  it('rejects parent (403)', async () => {
    const { schoolA, parentA } = await seed()
    const t = token(app, { userId: parentA, schoolId: schoolA, role: 'parent' })
    const res = await app.inject({
      method: 'GET',
      url: '/users?role=teacher',
      headers: { authorization: `Bearer ${t}` },
    })
    expect(res.statusCode).toBe(403)
  })

  it('rejects teacher (403)', async () => {
    const { schoolA, teacherA } = await seed()
    const t = token(app, { userId: teacherA, schoolId: schoolA, role: 'teacher' })
    const res = await app.inject({
      method: 'GET',
      url: '/users?role=teacher',
      headers: { authorization: `Bearer ${t}` },
    })
    expect(res.statusCode).toBe(403)
  })

  it('returns 400 if role query param is missing/invalid', async () => {
    const { schoolA, adminA } = await seed()
    const t = token(app, { userId: adminA, schoolId: schoolA, role: 'admin' })
    const res = await app.inject({
      method: 'GET',
      url: '/users?role=admin',
      headers: { authorization: `Bearer ${t}` },
    })
    expect(res.statusCode).toBe(400)
  })
})
