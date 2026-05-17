import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { eq } from 'drizzle-orm'
import { buildApp } from '../../app.js'
import { truncateAll } from '../../../tests/helpers/db.js'
import { db } from '../../db/client.js'
import { schools, classes } from '../../db/schema/schools.js'
import { students } from '../../db/schema/students.js'
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

  it('treats % and _ in names as literal characters (no wildcard collision)', async () => {
    const { schoolA, adminA, teacherA1, teacherA2 } = await seedTwoSchools()
    // Seed a class whose name contains a literal '%' — this could be
    // misinterpreted as a wildcard if the uniqueness query used a naive
    // ILIKE on the input.
    await db.insert(classes).values({ id: newId(), schoolId: schoolA, name: 'Grade %', teacherId: teacherA1 })
    const t = token(app, { userId: adminA, schoolId: schoolA, role: 'admin' })
    // Creating a class with a *different* name should succeed — the
    // existing 'Grade %' must not match 'Grade 3A' via wildcard.
    const res = await app.inject({
      method: 'POST',
      url: '/classes',
      headers: { authorization: `Bearer ${t}` },
      payload: { name: 'Grade 3A', teacherId: teacherA2 },
    })
    expect(res.statusCode).toBe(200)
    expect((res.json() as { name: string }).name).toBe('Grade 3A')
  })
})

describe('PATCH /classes/:id', () => {
  it('admin renames a class', async () => {
    const { schoolA, adminA, teacherA1 } = await seedTwoSchools()
    const id = newId()
    await db.insert(classes).values({ id, schoolId: schoolA, name: 'Old', teacherId: teacherA1 })
    const t = token(app, { userId: adminA, schoolId: schoolA, role: 'admin' })
    const res = await app.inject({
      method: 'PATCH',
      url: `/classes/${id}`,
      headers: { authorization: `Bearer ${t}` },
      payload: { name: 'New' },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json() as { name: string; teacherId: string }
    expect(body.name).toBe('New')
    expect(body.teacherId).toBe(teacherA1)
  })

  it('admin reassigns the teacher', async () => {
    const { schoolA, adminA, teacherA1, teacherA2 } = await seedTwoSchools()
    const id = newId()
    await db.insert(classes).values({ id, schoolId: schoolA, name: 'Grade 3A', teacherId: teacherA1 })
    const t = token(app, { userId: adminA, schoolId: schoolA, role: 'admin' })
    const res = await app.inject({
      method: 'PATCH',
      url: `/classes/${id}`,
      headers: { authorization: `Bearer ${t}` },
      payload: { teacherId: teacherA2 },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json() as { teacherId: string }
    expect(body.teacherId).toBe(teacherA2)
  })

  it('renames + reassigns in one call', async () => {
    const { schoolA, adminA, teacherA1, teacherA2 } = await seedTwoSchools()
    const id = newId()
    await db.insert(classes).values({ id, schoolId: schoolA, name: 'Old', teacherId: teacherA1 })
    const t = token(app, { userId: adminA, schoolId: schoolA, role: 'admin' })
    const res = await app.inject({
      method: 'PATCH',
      url: `/classes/${id}`,
      headers: { authorization: `Bearer ${t}` },
      payload: { name: 'New', teacherId: teacherA2 },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json() as { name: string; teacherId: string }
    expect(body.name).toBe('New')
    expect(body.teacherId).toBe(teacherA2)
  })

  it('rejects empty body (400)', async () => {
    const { schoolA, adminA, teacherA1 } = await seedTwoSchools()
    const id = newId()
    await db.insert(classes).values({ id, schoolId: schoolA, name: 'Grade 3A', teacherId: teacherA1 })
    const t = token(app, { userId: adminA, schoolId: schoolA, role: 'admin' })
    const res = await app.inject({
      method: 'PATCH',
      url: `/classes/${id}`,
      headers: { authorization: `Bearer ${t}` },
      payload: {},
    })
    expect(res.statusCode).toBe(400)
  })

  it('cross-tenant id returns 404', async () => {
    const { schoolA, schoolB, adminA, teacherB } = await seedTwoSchools()
    const id = newId()
    await db.insert(classes).values({ id, schoolId: schoolB, name: 'Foreign', teacherId: teacherB })
    const t = token(app, { userId: adminA, schoolId: schoolA, role: 'admin' })
    const res = await app.inject({
      method: 'PATCH',
      url: `/classes/${id}`,
      headers: { authorization: `Bearer ${t}` },
      payload: { name: 'Stolen' },
    })
    expect(res.statusCode).toBe(404)
  })

  it('duplicate teacher assignment returns 409 TEACHER_ALREADY_ASSIGNED', async () => {
    const { schoolA, adminA, teacherA1, teacherA2 } = await seedTwoSchools()
    const id1 = newId()
    const id2 = newId()
    await db.insert(classes).values([
      { id: id1, schoolId: schoolA, name: 'C1', teacherId: teacherA1 },
      { id: id2, schoolId: schoolA, name: 'C2', teacherId: teacherA2 },
    ])
    const t = token(app, { userId: adminA, schoolId: schoolA, role: 'admin' })
    const res = await app.inject({
      method: 'PATCH',
      url: `/classes/${id2}`,
      headers: { authorization: `Bearer ${t}` },
      payload: { teacherId: teacherA1 },
    })
    expect(res.statusCode).toBe(409)
    expect(res.json()).toMatchObject({ code: 'TEACHER_ALREADY_ASSIGNED' })
  })
})

describe('DELETE /classes/:id', () => {
  it('admin deletes an empty class', async () => {
    const { schoolA, adminA, teacherA1 } = await seedTwoSchools()
    const id = newId()
    await db.insert(classes).values({ id, schoolId: schoolA, name: 'Empty', teacherId: teacherA1 })
    const t = token(app, { userId: adminA, schoolId: schoolA, role: 'admin' })
    const res = await app.inject({
      method: 'DELETE',
      url: `/classes/${id}`,
      headers: { authorization: `Bearer ${t}` },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({ ok: true })
    const rows = await db.select().from(classes).where(eq(classes.id, id))
    expect(rows).toHaveLength(0)
  })

  it('refuses delete when class has students (409 CLASS_HAS_STUDENTS)', async () => {
    const { schoolA, adminA, teacherA1 } = await seedTwoSchools()
    const classId = newId()
    await db.insert(classes).values({ id: classId, schoolId: schoolA, name: 'Full', teacherId: teacherA1 })
    await db.insert(students).values([
      { id: newId(), schoolId: schoolA, classId, fullName: 'S1', rollNumber: '001', status: 'active' },
      { id: newId(), schoolId: schoolA, classId, fullName: 'S2', rollNumber: '002', status: 'inactive' },
    ])
    const t = token(app, { userId: adminA, schoolId: schoolA, role: 'admin' })
    const res = await app.inject({
      method: 'DELETE',
      url: `/classes/${classId}`,
      headers: { authorization: `Bearer ${t}` },
    })
    expect(res.statusCode).toBe(409)
    const body = res.json() as { code: string; message: string }
    expect(body.code).toBe('CLASS_HAS_STUDENTS')
    // Class still exists.
    const rows = await db.select().from(classes).where(eq(classes.id, classId))
    expect(rows).toHaveLength(1)
  })

  it('cross-tenant id returns 404', async () => {
    const { schoolA, schoolB, adminA, teacherB } = await seedTwoSchools()
    const id = newId()
    await db.insert(classes).values({ id, schoolId: schoolB, name: 'Foreign', teacherId: teacherB })
    const t = token(app, { userId: adminA, schoolId: schoolA, role: 'admin' })
    const res = await app.inject({
      method: 'DELETE',
      url: `/classes/${id}`,
      headers: { authorization: `Bearer ${t}` },
    })
    expect(res.statusCode).toBe(404)
  })
})

describe('unassign teacher (PATCH)', () => {
  it('admin clears a teacher assignment with teacherId: null', async () => {
    const { schoolA, adminA, teacherA1 } = await seedTwoSchools()
    const id = newId()
    await db.insert(classes).values({ id, schoolId: schoolA, name: 'Grade 3A', teacherId: teacherA1 })
    const t = token(app, { userId: adminA, schoolId: schoolA, role: 'admin' })
    const res = await app.inject({
      method: 'PATCH',
      url: `/classes/${id}`,
      headers: { authorization: `Bearer ${t}` },
      payload: { teacherId: null },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json() as { teacherId: string | null }
    expect(body.teacherId).toBeNull()
  })

  it('allows assigning a freed teacher to another class after unassign', async () => {
    const { schoolA, adminA, teacherA1, teacherA2 } = await seedTwoSchools()
    const id1 = newId()
    const id2 = newId()
    await db.insert(classes).values([
      { id: id1, schoolId: schoolA, name: 'C1', teacherId: teacherA1 },
      { id: id2, schoolId: schoolA, name: 'C2', teacherId: teacherA2 },
    ])
    const t = token(app, { userId: adminA, schoolId: schoolA, role: 'admin' })
    // Unassign T1 from C1.
    const r1 = await app.inject({
      method: 'PATCH',
      url: `/classes/${id1}`,
      headers: { authorization: `Bearer ${t}` },
      payload: { teacherId: null },
    })
    expect(r1.statusCode).toBe(200)
    // Assign T1 to a fresh class.
    const id3 = newId()
    await db.insert(classes).values({ id: id3, schoolId: schoolA, name: 'C3', teacherId: null })
    const r2 = await app.inject({
      method: 'PATCH',
      url: `/classes/${id3}`,
      headers: { authorization: `Bearer ${t}` },
      payload: { teacherId: teacherA1 },
    })
    expect(r2.statusCode).toBe(200)
    expect((r2.json() as { teacherId: string | null }).teacherId).toBe(teacherA1)
  })

  it('two unassigned classes coexist (partial unique index)', async () => {
    const { schoolA, adminA } = await seedTwoSchools()
    const t = token(app, { userId: adminA, schoolId: schoolA, role: 'admin' })
    const r1 = await app.inject({
      method: 'POST',
      url: '/classes',
      headers: { authorization: `Bearer ${t}` },
      payload: { name: 'Free A', teacherId: null },
    })
    expect(r1.statusCode).toBe(200)
    const r2 = await app.inject({
      method: 'POST',
      url: '/classes',
      headers: { authorization: `Bearer ${t}` },
      payload: { name: 'Free B', teacherId: null },
    })
    expect(r2.statusCode).toBe(200)
  })

  it('admin can create a class without teacherId field entirely', async () => {
    const { schoolA, adminA } = await seedTwoSchools()
    const t = token(app, { userId: adminA, schoolId: schoolA, role: 'admin' })
    const res = await app.inject({
      method: 'POST',
      url: '/classes',
      headers: { authorization: `Bearer ${t}` },
      payload: { name: 'No teacher key' },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json() as { teacherId: string | null }
    expect(body.teacherId).toBeNull()
  })
})
