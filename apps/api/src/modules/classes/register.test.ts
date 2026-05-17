import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { and, eq, isNotNull } from 'drizzle-orm'
import { buildApp } from '../../app.js'
import { truncateAll } from '../../../tests/helpers/db.js'
import { db } from '../../db/client.js'
import { schools, classes } from '../../db/schema/schools.js'
import { users } from '../../db/schema/auth.js'
import { students } from '../../db/schema/students.js'
import { cards } from '../../db/schema/cards.js'
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

interface Seed {
  schoolA: string
  schoolB: string
  classA: string
  classB: string
  teacherA: string
  teacherB: string
  adminA: string
  parentA: string
  studentA1: string
  studentA2: string
  cardA1: string
  cardA2: string
}

async function seedTwoSchools(): Promise<Seed> {
  const schoolA = newId()
  const schoolB = newId()
  const teacherA = newId()
  const teacherB = newId()
  const classA = newId()
  const classB = newId()
  const adminA = newId()
  const parentA = newId()
  const studentA1 = newId()
  const studentA2 = newId()
  const cardA1 = newId()
  const cardA2 = newId()
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
    { id: studentA1, schoolId: schoolA, classId: classA, fullName: 'SA1', rollNumber: '001', status: 'active' },
    { id: studentA2, schoolId: schoolA, classId: classA, fullName: 'SA2', rollNumber: '002', status: 'active' },
  ])
  await db.insert(cards).values([
    { id: cardA1, schoolId: schoolA, rfidUid: 'A1', studentId: studentA1, status: 'active' },
    { id: cardA2, schoolId: schoolA, rfidUid: 'A2', studentId: studentA2, status: 'active' },
  ])
  return { schoolA, schoolB, classA, classB, teacherA, teacherB, adminA, parentA, studentA1, studentA2, cardA1, cardA2 }
}

function token(app: FastifyInstance, payload: { userId: string; schoolId: string; role: 'parent' | 'admin' | 'teacher' }) {
  return app.jwt.sign(payload, { expiresIn: '1h' })
}

describe('POST /classes/:id/register/lock', () => {
  it('teacher of class locks the day: existing records get lockedAt/lockedBy + missing students become absent', async () => {
    const { schoolA, classA, teacherA, studentA1, studentA2 } = await seedTwoSchools()
    // Seed a "present" record for studentA1 only; studentA2 has nothing.
    await db.insert(attendanceRecords).values({
      id: newId(), schoolId: schoolA, studentId: studentA1, date: '2026-05-13',
      firstInAt: new Date('2026-05-13T02:48:00Z'), status: 'present', isManual: false,
    })
    const t = token(app, { userId: teacherA, schoolId: schoolA, role: 'teacher' })
    const res = await app.inject({
      method: 'POST',
      url: `/classes/${classA}/register/lock`,
      headers: { authorization: `Bearer ${t}` },
      payload: { date: '2026-05-13' },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json() as { lockedAt: string; lockedBy: string; records: Array<{ studentId: string; status: string; lockedAt?: string }> }
    expect(body.lockedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    expect(body.lockedBy).toBe(teacherA)
    expect(body.records).toHaveLength(2)
    const byStudent = new Map(body.records.map((r) => [r.studentId, r]))
    expect(byStudent.get(studentA1)?.status).toBe('present')
    expect(byStudent.get(studentA1)?.lockedAt).toBeDefined()
    expect(byStudent.get(studentA2)?.status).toBe('absent')
    expect(byStudent.get(studentA2)?.lockedAt).toBeDefined()

    // DB verification.
    const recs = await db
      .select()
      .from(attendanceRecords)
      .where(and(eq(attendanceRecords.schoolId, schoolA), eq(attendanceRecords.date, '2026-05-13')))
    expect(recs).toHaveLength(2)
    expect(recs.every((r) => r.lockedAt !== null)).toBe(true)
    expect(recs.every((r) => r.lockedBy === teacherA)).toBe(true)
  })

  it('teacher of another class cannot lock this class (403)', async () => {
    const { schoolA, classA, teacherB } = await seedTwoSchools()
    // teacherB belongs to schoolB but we mint a token for schoolA — simulating
    // a cross-class teacher within the same school would need a 4th seed; for
    // now this also covers cross-tenant (the 404 case below is the explicit
    // cross-tenant test).
    void teacherB
    // Re-use parentA path to exercise role-gate: parent should never be able
    // to lock; teacher-of-another-class follows the same rejection logic.
    const otherTeacher = newId()
    await db.insert(users).values({
      id: otherTeacher, schoolId: schoolA, role: 'teacher', fullName: 'Other', phone: '+923001200099', preferredLanguage: 'en',
    })
    const t = token(app, { userId: otherTeacher, schoolId: schoolA, role: 'teacher' })
    const res = await app.inject({
      method: 'POST',
      url: `/classes/${classA}/register/lock`,
      headers: { authorization: `Bearer ${t}` },
      payload: { date: '2026-05-13' },
    })
    expect(res.statusCode).toBe(403)
  })

  it('admin can lock on behalf of the class teacher', async () => {
    const { schoolA, classA, adminA } = await seedTwoSchools()
    const t = token(app, { userId: adminA, schoolId: schoolA, role: 'admin' })
    const res = await app.inject({
      method: 'POST',
      url: `/classes/${classA}/register/lock`,
      headers: { authorization: `Bearer ${t}` },
      payload: { date: '2026-05-13' },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json() as { lockedBy: string }
    expect(body.lockedBy).toBe(adminA)
  })

  it('parent gets 403', async () => {
    const { schoolA, classA, parentA } = await seedTwoSchools()
    const t = token(app, { userId: parentA, schoolId: schoolA, role: 'parent' })
    const res = await app.inject({
      method: 'POST',
      url: `/classes/${classA}/register/lock`,
      headers: { authorization: `Bearer ${t}` },
      payload: { date: '2026-05-13' },
    })
    expect(res.statusCode).toBe(403)
  })

  it('cross-tenant: admin of A locking class of B → 404', async () => {
    const { schoolA, classB, adminA } = await seedTwoSchools()
    const t = token(app, { userId: adminA, schoolId: schoolA, role: 'admin' })
    const res = await app.inject({
      method: 'POST',
      url: `/classes/${classB}/register/lock`,
      headers: { authorization: `Bearer ${t}` },
      payload: { date: '2026-05-13' },
    })
    expect(res.statusCode).toBe(404)
  })

  it('locking an already-locked day is idempotent: returns same lockedBy', async () => {
    const { schoolA, classA, teacherA } = await seedTwoSchools()
    const t = token(app, { userId: teacherA, schoolId: schoolA, role: 'teacher' })
    const first = await app.inject({
      method: 'POST', url: `/classes/${classA}/register/lock`,
      headers: { authorization: `Bearer ${t}` }, payload: { date: '2026-05-13' },
    })
    expect(first.statusCode).toBe(200)
    const firstLockedBy = (first.json() as { lockedBy: string }).lockedBy
    const second = await app.inject({
      method: 'POST', url: `/classes/${classA}/register/lock`,
      headers: { authorization: `Bearer ${t}` }, payload: { date: '2026-05-13' },
    })
    expect(second.statusCode).toBe(200)
    expect((second.json() as { lockedBy: string }).lockedBy).toBe(firstLockedBy)
  })
})

describe('POST /classes/:id/register/unlock', () => {
  it('admin clears lockedAt + lockedBy for every record on that class/date', async () => {
    const { schoolA, classA, teacherA, adminA, studentA1 } = await seedTwoSchools()
    // Lock first.
    const t1 = token(app, { userId: teacherA, schoolId: schoolA, role: 'teacher' })
    await app.inject({
      method: 'POST', url: `/classes/${classA}/register/lock`,
      headers: { authorization: `Bearer ${t1}` }, payload: { date: '2026-05-13' },
    })
    // Sanity: records are locked.
    const lockedRows = await db
      .select()
      .from(attendanceRecords)
      .where(and(
        eq(attendanceRecords.schoolId, schoolA),
        eq(attendanceRecords.date, '2026-05-13'),
        isNotNull(attendanceRecords.lockedAt),
      ))
    expect(lockedRows.length).toBeGreaterThan(0)

    // Unlock.
    const t2 = token(app, { userId: adminA, schoolId: schoolA, role: 'admin' })
    const res = await app.inject({
      method: 'POST', url: `/classes/${classA}/register/unlock`,
      headers: { authorization: `Bearer ${t2}` }, payload: { date: '2026-05-13' },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({ ok: true })

    // Sanity: cleared.
    const stillLocked = await db
      .select()
      .from(attendanceRecords)
      .where(and(
        eq(attendanceRecords.schoolId, schoolA),
        eq(attendanceRecords.date, '2026-05-13'),
        isNotNull(attendanceRecords.lockedAt),
      ))
    expect(stillLocked).toHaveLength(0)
    void studentA1
  })

  it('teacher cannot unlock (403)', async () => {
    const { schoolA, classA, teacherA } = await seedTwoSchools()
    const t = token(app, { userId: teacherA, schoolId: schoolA, role: 'teacher' })
    // Lock first.
    await app.inject({
      method: 'POST', url: `/classes/${classA}/register/lock`,
      headers: { authorization: `Bearer ${t}` }, payload: { date: '2026-05-13' },
    })
    // Teacher tries to unlock.
    const res = await app.inject({
      method: 'POST', url: `/classes/${classA}/register/unlock`,
      headers: { authorization: `Bearer ${t}` }, payload: { date: '2026-05-13' },
    })
    expect(res.statusCode).toBe(403)
  })

  it('cross-tenant: admin of A unlocking class of B → 404', async () => {
    const { schoolA, classB, adminA } = await seedTwoSchools()
    const t = token(app, { userId: adminA, schoolId: schoolA, role: 'admin' })
    const res = await app.inject({
      method: 'POST', url: `/classes/${classB}/register/unlock`,
      headers: { authorization: `Bearer ${t}` }, payload: { date: '2026-05-13' },
    })
    expect(res.statusCode).toBe(404)
  })
})

describe('locked-day side effects', () => {
  it('teacher manual override on a locked day → 409', async () => {
    const { schoolA, classA, teacherA, studentA1 } = await seedTwoSchools()
    const t = token(app, { userId: teacherA, schoolId: schoolA, role: 'teacher' })
    await app.inject({
      method: 'POST', url: `/classes/${classA}/register/lock`,
      headers: { authorization: `Bearer ${t}` }, payload: { date: '2026-05-13' },
    })
    const res = await app.inject({
      method: 'POST',
      url: '/tap-events/manual',
      headers: { authorization: `Bearer ${t}` },
      payload: {
        studentId: studentA1,
        direction: 'in',
        occurredAt: new Date('2026-05-13T02:48:00Z').toISOString(),
        reasonKind: 'forgot_card',
        reason: 'Late paperwork',
      },
    })
    expect(res.statusCode).toBe(409)
  })

  it('admin can override a locked day (409 only fires for non-admin)', async () => {
    const { schoolA, classA, teacherA, adminA, studentA1 } = await seedTwoSchools()
    const tT = token(app, { userId: teacherA, schoolId: schoolA, role: 'teacher' })
    await app.inject({
      method: 'POST', url: `/classes/${classA}/register/lock`,
      headers: { authorization: `Bearer ${tT}` }, payload: { date: '2026-05-13' },
    })
    const tA = token(app, { userId: adminA, schoolId: schoolA, role: 'admin' })
    const res = await app.inject({
      method: 'POST',
      url: '/tap-events/manual',
      headers: { authorization: `Bearer ${tA}` },
      payload: {
        studentId: studentA1,
        direction: 'out',
        occurredAt: new Date('2026-05-13T08:30:00Z').toISOString(),
        reasonKind: 'early_pickup',
        reason: 'Admin correction',
      },
    })
    expect(res.statusCode).toBe(200)
  })
})
