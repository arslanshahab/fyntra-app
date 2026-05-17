import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { eq } from 'drizzle-orm'
import { buildApp } from '../../app.js'
import { truncateAll } from '../../../tests/helpers/db.js'
import { db } from '../../db/client.js'
import { schools } from '../../db/schema/schools.js'
import { users } from '../../db/schema/auth.js'
import { newId } from '../../lib/ids.js'
import { schoolSchema } from '@fyntra/schemas'

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

async function seedOneSchool() {
  const schoolId = newId()
  const adminId = newId()
  const parentId = newId()
  const teacherId = newId()
  await db.insert(schools).values({
    id: schoolId, name: 'A', address: 'a', startTime: '07:45', endTime: '13:30',
    lateThresholdMinutes: 10, absentThresholdMinutes: 30,
  })
  await db.insert(users).values([
    { id: adminId, schoolId, role: 'admin', fullName: 'AdminA', phone: '+923001100090', preferredLanguage: 'en' },
    { id: parentId, schoolId, role: 'parent', fullName: 'ParentA', phone: '+923001100091', preferredLanguage: 'en' },
    { id: teacherId, schoolId, role: 'teacher', fullName: 'TeacherA', phone: '+923001100092', preferredLanguage: 'en' },
  ])
  return { schoolId, adminId, parentId, teacherId }
}

function token(app: FastifyInstance, payload: { userId: string; schoolId: string; role: 'parent' | 'admin' | 'teacher' }) {
  return app.jwt.sign(payload, { expiresIn: '1h' })
}

describe('PATCH /schools/me', () => {
  it('admin updates workingDays + halfDayCutoffTime + late threshold', async () => {
    const { schoolId, adminId } = await seedOneSchool()
    const t = token(app, { userId: adminId, schoolId, role: 'admin' })
    const res = await app.inject({
      method: 'PATCH',
      url: '/schools/me',
      headers: { authorization: `Bearer ${t}` },
      payload: {
        workingDays: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat'],
        halfDayCutoffTime: '12:00',
        lateThresholdMinutes: 15,
      },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json() as { workingDays: string[]; halfDayCutoffTime?: string; lateThresholdMinutes: number }
    expect(body.workingDays).toEqual(['mon', 'tue', 'wed', 'thu', 'fri', 'sat'])
    expect(body.halfDayCutoffTime).toBe('12:00')
    expect(body.lateThresholdMinutes).toBe(15)
    // Response is a valid School wire shape.
    expect(() => schoolSchema.parse(body)).not.toThrow()
    // Persisted in DB.
    const rows = await db.select().from(schools).where(eq(schools.id, schoolId))
    expect(rows[0]?.workingDays).toEqual(['mon', 'tue', 'wed', 'thu', 'fri', 'sat'])
    expect(rows[0]?.halfDayCutoffTime).toBe('12:00')
    expect(rows[0]?.lateThresholdMinutes).toBe(15)
  })

  it('admin sets halfDayCutoffTime then clears it via null', async () => {
    const { schoolId, adminId } = await seedOneSchool()
    const t = token(app, { userId: adminId, schoolId, role: 'admin' })

    await app.inject({
      method: 'PATCH',
      url: '/schools/me',
      headers: { authorization: `Bearer ${t}` },
      payload: { halfDayCutoffTime: '12:00' },
    })
    const cleared = await app.inject({
      method: 'PATCH',
      url: '/schools/me',
      headers: { authorization: `Bearer ${t}` },
      payload: { halfDayCutoffTime: null },
    })
    expect(cleared.statusCode).toBe(200)
    const body = cleared.json() as { halfDayCutoffTime?: string }
    expect(body.halfDayCutoffTime).toBeUndefined()
  })

  it('admin sets academicYearStart + academicYearEnd', async () => {
    const { schoolId, adminId } = await seedOneSchool()
    const t = token(app, { userId: adminId, schoolId, role: 'admin' })
    const res = await app.inject({
      method: 'PATCH',
      url: '/schools/me',
      headers: { authorization: `Bearer ${t}` },
      payload: { academicYearStart: '2026-04-01', academicYearEnd: '2027-03-31' },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json() as { academicYearStart?: string; academicYearEnd?: string }
    expect(body.academicYearStart).toBe('2026-04-01')
    expect(body.academicYearEnd).toBe('2027-03-31')
  })

  it('rejects academicYearStart after academicYearEnd (400)', async () => {
    const { schoolId, adminId } = await seedOneSchool()
    const t = token(app, { userId: adminId, schoolId, role: 'admin' })
    const res = await app.inject({
      method: 'PATCH',
      url: '/schools/me',
      headers: { authorization: `Bearer ${t}` },
      payload: { academicYearStart: '2027-04-01', academicYearEnd: '2026-03-31' },
    })
    expect(res.statusCode).toBe(400)
  })

  it('rejects startTime >= endTime (400)', async () => {
    const { schoolId, adminId } = await seedOneSchool()
    const t = token(app, { userId: adminId, schoolId, role: 'admin' })
    const res = await app.inject({
      method: 'PATCH',
      url: '/schools/me',
      headers: { authorization: `Bearer ${t}` },
      payload: { startTime: '14:00', endTime: '13:00' },
    })
    expect(res.statusCode).toBe(400)
  })

  it('rejects empty workingDays (400)', async () => {
    const { schoolId, adminId } = await seedOneSchool()
    const t = token(app, { userId: adminId, schoolId, role: 'admin' })
    const res = await app.inject({
      method: 'PATCH',
      url: '/schools/me',
      headers: { authorization: `Bearer ${t}` },
      payload: { workingDays: [] },
    })
    expect(res.statusCode).toBe(400)
  })

  it('rejects malformed weekday code (400)', async () => {
    const { schoolId, adminId } = await seedOneSchool()
    const t = token(app, { userId: adminId, schoolId, role: 'admin' })
    const res = await app.inject({
      method: 'PATCH',
      url: '/schools/me',
      headers: { authorization: `Bearer ${t}` },
      payload: { workingDays: ['mon', 'funday'] },
    })
    expect(res.statusCode).toBe(400)
  })

  it('parent cannot patch (403)', async () => {
    const { schoolId, parentId } = await seedOneSchool()
    const t = token(app, { userId: parentId, schoolId, role: 'parent' })
    const res = await app.inject({
      method: 'PATCH',
      url: '/schools/me',
      headers: { authorization: `Bearer ${t}` },
      payload: { lateThresholdMinutes: 15 },
    })
    expect(res.statusCode).toBe(403)
  })

  it('teacher cannot patch (403)', async () => {
    const { schoolId, teacherId } = await seedOneSchool()
    const t = token(app, { userId: teacherId, schoolId, role: 'teacher' })
    const res = await app.inject({
      method: 'PATCH',
      url: '/schools/me',
      headers: { authorization: `Bearer ${t}` },
      payload: { lateThresholdMinutes: 15 },
    })
    expect(res.statusCode).toBe(403)
  })

  it('empty body is a no-op that returns the current school', async () => {
    const { schoolId, adminId } = await seedOneSchool()
    const t = token(app, { userId: adminId, schoolId, role: 'admin' })
    const res = await app.inject({
      method: 'PATCH',
      url: '/schools/me',
      headers: { authorization: `Bearer ${t}` },
      payload: {},
    })
    expect(res.statusCode).toBe(200)
    const body = res.json() as { startTime: string; workingDays: string[] }
    expect(body.startTime).toBe('07:45')
    expect(body.workingDays).toEqual(['mon', 'tue', 'wed', 'thu', 'fri'])
  })
})
