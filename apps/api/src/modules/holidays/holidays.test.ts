import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { and, eq } from 'drizzle-orm'
import { buildApp } from '../../app.js'
import { truncateAll } from '../../../tests/helpers/db.js'
import { db } from '../../db/client.js'
import { schools } from '../../db/schema/schools.js'
import { users } from '../../db/schema/auth.js'
import { schoolHolidays } from '../../db/schema/holidays.js'
import { newId } from '../../lib/ids.js'
import { holidaySchema } from '@fyntra/schemas'

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
  const adminB = newId()
  await db.insert(schools).values([
    { id: schoolA, name: 'A', address: 'a', startTime: '07:45', endTime: '13:30', lateThresholdMinutes: 10, absentThresholdMinutes: 30 },
    { id: schoolB, name: 'B', address: 'b', startTime: '07:45', endTime: '13:30', lateThresholdMinutes: 10, absentThresholdMinutes: 30 },
  ])
  await db.insert(users).values([
    { id: adminA, schoolId: schoolA, role: 'admin', fullName: 'AdminA', phone: '+923001100090', preferredLanguage: 'en' },
    { id: parentA, schoolId: schoolA, role: 'parent', fullName: 'ParentA', phone: '+923001100091', preferredLanguage: 'en' },
    { id: adminB, schoolId: schoolB, role: 'admin', fullName: 'AdminB', phone: '+923001100092', preferredLanguage: 'en' },
  ])
  return { schoolA, schoolB, adminA, parentA, adminB }
}

function token(app: FastifyInstance, payload: { userId: string; schoolId: string; role: 'parent' | 'admin' | 'teacher' }) {
  return app.jwt.sign(payload, { expiresIn: '1h' })
}

describe('holidays routes', () => {
  it('GET /holidays returns only caller-school rows, ordered by date asc', async () => {
    const { schoolA, schoolB, adminA } = await seedTwoSchools()
    // Two for A, one for B.
    await db.insert(schoolHolidays).values([
      { id: newId(), schoolId: schoolA, date: '2026-08-14', label: 'Independence Day', kind: 'closed' },
      { id: newId(), schoolId: schoolA, date: '2026-03-23', label: 'Pakistan Day', kind: 'closed' },
      { id: newId(), schoolId: schoolB, date: '2026-08-14', label: 'Independence Day', kind: 'closed' },
    ])
    const t = token(app, { userId: adminA, schoolId: schoolA, role: 'admin' })
    const res = await app.inject({ method: 'GET', url: '/holidays', headers: { authorization: `Bearer ${t}` } })
    expect(res.statusCode).toBe(200)
    const body = res.json() as Array<{ schoolId: string; date: string; label: string }>
    expect(body).toHaveLength(2)
    expect(body.every((h) => h.schoolId === schoolA)).toBe(true)
    expect(body.map((h) => h.date)).toEqual(['2026-03-23', '2026-08-14'])
    // Each row conforms to the wire schema.
    for (const h of body) expect(() => holidaySchema.parse(h)).not.toThrow()
  })

  it('GET /holidays?from=&to= filters to the date range (inclusive)', async () => {
    const { schoolA, adminA } = await seedTwoSchools()
    await db.insert(schoolHolidays).values([
      { id: newId(), schoolId: schoolA, date: '2026-03-23', label: 'Pakistan Day', kind: 'closed' },
      { id: newId(), schoolId: schoolA, date: '2026-05-01', label: 'Labour Day', kind: 'closed' },
      { id: newId(), schoolId: schoolA, date: '2026-08-14', label: 'Independence Day', kind: 'closed' },
    ])
    const t = token(app, { userId: adminA, schoolId: schoolA, role: 'admin' })
    const res = await app.inject({
      method: 'GET',
      url: '/holidays?from=2026-04-01&to=2026-06-30',
      headers: { authorization: `Bearer ${t}` },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json() as Array<{ date: string; label: string }>
    expect(body).toHaveLength(1)
    expect(body[0]?.date).toBe('2026-05-01')
  })

  it('parent can read holidays (any auth)', async () => {
    const { schoolA, parentA } = await seedTwoSchools()
    await db.insert(schoolHolidays).values({
      id: newId(), schoolId: schoolA, date: '2026-03-23', label: 'Pakistan Day', kind: 'closed',
    })
    const t = token(app, { userId: parentA, schoolId: schoolA, role: 'parent' })
    const res = await app.inject({ method: 'GET', url: '/holidays', headers: { authorization: `Bearer ${t}` } })
    expect(res.statusCode).toBe(200)
    expect((res.json() as unknown[]).length).toBe(1)
  })

  it('admin can create a closed holiday', async () => {
    const { schoolA, adminA } = await seedTwoSchools()
    const t = token(app, { userId: adminA, schoolId: schoolA, role: 'admin' })
    const res = await app.inject({
      method: 'POST',
      url: '/holidays',
      headers: { authorization: `Bearer ${t}` },
      payload: { date: '2026-03-23', label: 'Pakistan Day', kind: 'closed' },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json() as { id: string; schoolId: string; date: string; kind: string; createdBy?: string; createdAt: string }
    expect(body.schoolId).toBe(schoolA)
    expect(body.date).toBe('2026-03-23')
    expect(body.kind).toBe('closed')
    expect(body.createdBy).toBe(adminA)
    expect(() => holidaySchema.parse(body)).not.toThrow()
    const rows = await db.select().from(schoolHolidays).where(eq(schoolHolidays.id, body.id))
    expect(rows).toHaveLength(1)
  })

  it('admin can create a half_day holiday with effectiveEndTime', async () => {
    const { schoolA, adminA } = await seedTwoSchools()
    const t = token(app, { userId: adminA, schoolId: schoolA, role: 'admin' })
    const res = await app.inject({
      method: 'POST',
      url: '/holidays',
      headers: { authorization: `Bearer ${t}` },
      payload: { date: '2026-04-03', label: 'Half-day Friday', kind: 'half_day', effectiveEndTime: '12:00' },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json() as { kind: string; effectiveEndTime?: string }
    expect(body.kind).toBe('half_day')
    expect(body.effectiveEndTime).toBe('12:00')
  })

  it('rejects half_day without effectiveEndTime (400)', async () => {
    const { schoolA, adminA } = await seedTwoSchools()
    const t = token(app, { userId: adminA, schoolId: schoolA, role: 'admin' })
    const res = await app.inject({
      method: 'POST',
      url: '/holidays',
      headers: { authorization: `Bearer ${t}` },
      payload: { date: '2026-04-03', label: 'Half-day Friday', kind: 'half_day' },
    })
    expect(res.statusCode).toBe(400)
  })

  it('rejects effectiveEndTime on closed kind (400)', async () => {
    const { schoolA, adminA } = await seedTwoSchools()
    const t = token(app, { userId: adminA, schoolId: schoolA, role: 'admin' })
    const res = await app.inject({
      method: 'POST',
      url: '/holidays',
      headers: { authorization: `Bearer ${t}` },
      payload: { date: '2026-03-23', label: 'Pakistan Day', kind: 'closed', effectiveEndTime: '12:00' },
    })
    expect(res.statusCode).toBe(400)
  })

  it('parent cannot create a holiday (403)', async () => {
    const { schoolA, parentA } = await seedTwoSchools()
    const t = token(app, { userId: parentA, schoolId: schoolA, role: 'parent' })
    const res = await app.inject({
      method: 'POST',
      url: '/holidays',
      headers: { authorization: `Bearer ${t}` },
      payload: { date: '2026-03-23', label: 'Pakistan Day', kind: 'closed' },
    })
    expect(res.statusCode).toBe(403)
  })

  it('rejects duplicate (school, date) with 409', async () => {
    const { schoolA, adminA } = await seedTwoSchools()
    const t = token(app, { userId: adminA, schoolId: schoolA, role: 'admin' })
    const first = await app.inject({
      method: 'POST',
      url: '/holidays',
      headers: { authorization: `Bearer ${t}` },
      payload: { date: '2026-03-23', label: 'Pakistan Day', kind: 'closed' },
    })
    expect(first.statusCode).toBe(200)
    const dup = await app.inject({
      method: 'POST',
      url: '/holidays',
      headers: { authorization: `Bearer ${t}` },
      payload: { date: '2026-03-23', label: 'Dup', kind: 'closed' },
    })
    expect(dup.statusCode).toBe(409)
  })

  it('admin can patch label + kind', async () => {
    const { schoolA, adminA } = await seedTwoSchools()
    const id = newId()
    await db.insert(schoolHolidays).values({ id, schoolId: schoolA, date: '2026-03-23', label: 'Old', kind: 'closed' })
    const t = token(app, { userId: adminA, schoolId: schoolA, role: 'admin' })
    const res = await app.inject({
      method: 'PATCH',
      url: `/holidays/${id}`,
      headers: { authorization: `Bearer ${t}` },
      payload: { label: 'New Label', kind: 'exam' },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json() as { label: string; kind: string }
    expect(body.label).toBe('New Label')
    expect(body.kind).toBe('exam')
  })

  it('patching kind from closed → half_day requires effectiveEndTime (400)', async () => {
    const { schoolA, adminA } = await seedTwoSchools()
    const id = newId()
    await db.insert(schoolHolidays).values({ id, schoolId: schoolA, date: '2026-03-23', label: 'X', kind: 'closed' })
    const t = token(app, { userId: adminA, schoolId: schoolA, role: 'admin' })
    const res = await app.inject({
      method: 'PATCH',
      url: `/holidays/${id}`,
      headers: { authorization: `Bearer ${t}` },
      payload: { kind: 'half_day' },
    })
    expect(res.statusCode).toBe(400)
  })

  it('admin of A patching holiday of B returns 404', async () => {
    const { schoolA, schoolB, adminA } = await seedTwoSchools()
    const id = newId()
    await db.insert(schoolHolidays).values({ id, schoolId: schoolB, date: '2026-03-23', label: 'B-only', kind: 'closed' })
    const t = token(app, { userId: adminA, schoolId: schoolA, role: 'admin' })
    const res = await app.inject({
      method: 'PATCH',
      url: `/holidays/${id}`,
      headers: { authorization: `Bearer ${t}` },
      payload: { label: 'Hijacked' },
    })
    expect(res.statusCode).toBe(404)
    // The row in school B is untouched.
    const rows = await db
      .select()
      .from(schoolHolidays)
      .where(and(eq(schoolHolidays.id, id), eq(schoolHolidays.schoolId, schoolB)))
    expect(rows[0]?.label).toBe('B-only')
  })

  it('admin can delete a holiday', async () => {
    const { schoolA, adminA } = await seedTwoSchools()
    const id = newId()
    await db.insert(schoolHolidays).values({ id, schoolId: schoolA, date: '2026-03-23', label: 'Bye', kind: 'closed' })
    const t = token(app, { userId: adminA, schoolId: schoolA, role: 'admin' })
    const res = await app.inject({ method: 'DELETE', url: `/holidays/${id}`, headers: { authorization: `Bearer ${t}` } })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ ok: true })
    const rows = await db.select().from(schoolHolidays).where(eq(schoolHolidays.id, id))
    expect(rows).toHaveLength(0)
  })

  it('parent cannot delete a holiday (403)', async () => {
    const { schoolA, parentA } = await seedTwoSchools()
    const id = newId()
    await db.insert(schoolHolidays).values({ id, schoolId: schoolA, date: '2026-03-23', label: 'X', kind: 'closed' })
    const t = token(app, { userId: parentA, schoolId: schoolA, role: 'parent' })
    const res = await app.inject({ method: 'DELETE', url: `/holidays/${id}`, headers: { authorization: `Bearer ${t}` } })
    expect(res.statusCode).toBe(403)
  })

  it('admin of A deleting holiday of B returns 404', async () => {
    const { schoolA, schoolB, adminA } = await seedTwoSchools()
    const id = newId()
    await db.insert(schoolHolidays).values({ id, schoolId: schoolB, date: '2026-03-23', label: 'B-only', kind: 'closed' })
    const t = token(app, { userId: adminA, schoolId: schoolA, role: 'admin' })
    const res = await app.inject({ method: 'DELETE', url: `/holidays/${id}`, headers: { authorization: `Bearer ${t}` } })
    expect(res.statusCode).toBe(404)
    const rows = await db.select().from(schoolHolidays).where(eq(schoolHolidays.id, id))
    expect(rows).toHaveLength(1)
  })
})
