import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { createHash } from 'node:crypto'
import { buildApp } from '../../src/app.js'
import { truncateAll } from '../helpers/db.js'
import { db, pool } from '../../src/db/client.js'
import { schools, classes } from '../../src/db/schema/schools.js'
import { users, otpCodes } from '../../src/db/schema/auth.js'
import { eq } from 'drizzle-orm'
import { newId } from '../../src/lib/ids.js'

let app: FastifyInstance

const parentPhone = '+923001000099'

async function seedParent() {
  const schoolId = newId()
  const teacherId = newId()
  await db.insert(schools).values({
    id: schoolId,
    name: 's',
    address: 'a',
    startTime: '07:45',
    endTime: '13:30',
    lateThresholdMinutes: 10,
    absentThresholdMinutes: 30,
  })
  await db.insert(users).values({
    id: teacherId,
    schoolId,
    role: 'teacher',
    fullName: 'T',
    phone: '+923001200099',
    preferredLanguage: 'en',
  })
  await db.insert(classes).values({ id: newId(), schoolId, name: 'c', teacherId })
  await db.insert(users).values({
    id: newId(),
    schoolId,
    role: 'parent',
    fullName: 'P',
    phone: parentPhone,
    preferredLanguage: 'en',
  })
}

async function readOtp(phone: string): Promise<string> {
  const rows = await db.select().from(otpCodes).where(eq(otpCodes.phone, phone))
  const row = rows[rows.length - 1]!
  for (let i = 0; i < 10000; i++) {
    const candidate = String(i).padStart(4, '0')
    if (createHash('sha256').update(`${row.salt}:${candidate}`).digest('hex') === row.codeHash) {
      return candidate
    }
  }
  throw new Error('could not find code')
}

beforeAll(async () => {
  app = await buildApp()
  await app.ready()
})
afterAll(async () => {
  await app.close()
  await pool.end()
})
beforeEach(async () => {
  await truncateAll()
})

describe('auth flow', () => {
  it('request-otp → verify-otp → /me', async () => {
    await seedParent()
    const req1 = await app.inject({
      method: 'POST',
      url: '/auth/request-otp',
      payload: { phone: parentPhone },
    })
    expect(req1.statusCode).toBe(200)
    expect(req1.json()).toEqual({ ok: true })

    const code = await readOtp(parentPhone)

    const req2 = await app.inject({
      method: 'POST',
      url: '/auth/verify-otp',
      payload: { phone: parentPhone, otp: code },
    })
    expect(req2.statusCode).toBe(200)
    const { token, user } = req2.json() as { token: string; user: { phone: string; role: string } }
    expect(user.phone).toBe(parentPhone)
    expect(user.role).toBe('parent')

    const req3 = await app.inject({
      method: 'GET',
      url: '/me',
      headers: { authorization: `Bearer ${token}` },
    })
    expect(req3.statusCode).toBe(200)
    const me = req3.json() as { user: { role: string }; school: { id: string } }
    expect(me.user.role).toBe('parent')
    expect(me.school.id).toBeTypeOf('string')
  })

  it('rejects /me without a token', async () => {
    const res = await app.inject({ method: 'GET', url: '/me' })
    expect(res.statusCode).toBe(401)
  })
})
