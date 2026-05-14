import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../../app.js'
import { truncateAll } from '../../../tests/helpers/db.js'
import { db } from '../../db/client.js'
import { schools, classes } from '../../db/schema/schools.js'
import { users } from '../../db/schema/auth.js'
import { students } from '../../db/schema/students.js'
import { cards, cardAuditEntries } from '../../db/schema/cards.js'
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
  const adminA = newId()
  const classA = newId()
  const classB = newId()
  const studentA1 = newId()
  const studentA2 = newId()
  const studentB = newId()
  const cardA = newId()
  const cardB = newId()
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
  await db.insert(students).values([
    { id: studentA1, schoolId: schoolA, classId: classA, fullName: 'SA1', rollNumber: '001', status: 'active' },
    { id: studentA2, schoolId: schoolA, classId: classA, fullName: 'SA2', rollNumber: '002', status: 'active' },
    { id: studentB, schoolId: schoolB, classId: classB, fullName: 'SB', rollNumber: '001', status: 'active' },
  ])
  await db.insert(cards).values([
    { id: cardA, schoolId: schoolA, rfidUid: 'A_UID_001', studentId: studentA1, status: 'active' },
    { id: cardB, schoolId: schoolB, rfidUid: 'B_UID_001', studentId: studentB, status: 'active' },
  ])
  return { schoolA, schoolB, adminA, studentA1, studentA2, studentB, cardA, cardB }
}

function token(app: FastifyInstance, payload: { userId: string; schoolId: string; role: 'parent' | 'admin' | 'teacher' }) {
  return app.jwt.sign(payload, { expiresIn: '1h' })
}

describe('cards routes', () => {
  it('GET /cards?status=active returns school-scoped cards', async () => {
    const { schoolA, adminA, cardA } = await seedTwoSchools()
    const t = token(app, { userId: adminA, schoolId: schoolA, role: 'admin' })
    const res = await app.inject({
      method: 'GET',
      url: '/cards?status=active',
      headers: { authorization: `Bearer ${t}` },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json() as Array<{ id: string; status: string }>
    expect(body.map((c) => c.id)).toEqual([cardA])
    expect(body[0]?.status).toBe('active')
  })

  it('POST /cards/assign replaces the student\'s previous active card', async () => {
    const { schoolA, adminA, studentA1, cardA } = await seedTwoSchools()
    // Issue a new spare card unassigned in school A
    const spareId = newId()
    await db.insert(cards).values({
      id: spareId, schoolId: schoolA, rfidUid: 'SPARE_UID', status: 'active',
    })
    const t = token(app, { userId: adminA, schoolId: schoolA, role: 'admin' })
    const res = await app.inject({
      method: 'POST',
      url: '/cards/assign',
      headers: { authorization: `Bearer ${t}` },
      payload: { cardId: spareId, studentId: studentA1 },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json() as { id: string; status: string; auditLog: Array<{ action: string }> }
    expect(body.id).toBe(spareId)
    expect(body.status).toBe('active')
    expect(body.auditLog.map((a) => a.action)).toEqual(['assigned'])

    // Old card is now 'replaced' with an audit entry
    const oldCard = await db.select().from(cards).where(eq(cards.id, cardA)).limit(1)
    expect(oldCard[0]?.status).toBe('replaced')
    const oldAudit = await db
      .select()
      .from(cardAuditEntries)
      .where(eq(cardAuditEntries.cardId, cardA))
    expect(oldAudit.map((a) => a.action)).toEqual(['replaced'])
  })

  it('POST /cards/replace creates a new active card and marks the old replaced', async () => {
    const { schoolA, adminA, studentA1, cardA } = await seedTwoSchools()
    const t = token(app, { userId: adminA, schoolId: schoolA, role: 'admin' })
    const res = await app.inject({
      method: 'POST',
      url: '/cards/replace',
      headers: { authorization: `Bearer ${t}` },
      payload: { studentId: studentA1, newRfidUid: 'NEW_UID' },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json() as { id: string; rfidUid: string; status: string; auditLog: Array<{ action: string }> }
    expect(body.rfidUid).toBe('NEW_UID')
    expect(body.status).toBe('active')
    expect(body.auditLog.map((a) => a.action)).toEqual(['issued'])

    // Old card is 'replaced'
    const oldCard = await db.select().from(cards).where(eq(cards.id, cardA)).limit(1)
    expect(oldCard[0]?.status).toBe('replaced')
  })

  it('PATCH /cards/:id appends a status-mapped audit entry', async () => {
    const { schoolA, adminA, cardA } = await seedTwoSchools()
    const t = token(app, { userId: adminA, schoolId: schoolA, role: 'admin' })
    const res = await app.inject({
      method: 'PATCH',
      url: `/cards/${cardA}`,
      headers: { authorization: `Bearer ${t}` },
      payload: { status: 'lost' },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json() as { status: string; auditLog: Array<{ action: string }> }
    expect(body.status).toBe('lost')
    expect(body.auditLog.map((a) => a.action)).toEqual(['lost'])
  })

  it('cross-tenant: admin of A patching card of B returns 404', async () => {
    const { schoolA, adminA, cardB } = await seedTwoSchools()
    const t = token(app, { userId: adminA, schoolId: schoolA, role: 'admin' })
    const res = await app.inject({
      method: 'PATCH',
      url: `/cards/${cardB}`,
      headers: { authorization: `Bearer ${t}` },
      payload: { status: 'lost' },
    })
    expect(res.statusCode).toBe(404)
  })

  it('non-admin (parent) gets 403 on mutation', async () => {
    const { schoolA, cardA } = await seedTwoSchools()
    const parentId = newId()
    await db.insert(users).values({
      id: parentId, schoolId: schoolA, role: 'parent',
      fullName: 'Parent', phone: '+923001000080', preferredLanguage: 'en',
    })
    const t = token(app, { userId: parentId, schoolId: schoolA, role: 'parent' })
    const res = await app.inject({
      method: 'PATCH',
      url: `/cards/${cardA}`,
      headers: { authorization: `Bearer ${t}` },
      payload: { status: 'lost' },
    })
    expect(res.statusCode).toBe(403)
  })
})
