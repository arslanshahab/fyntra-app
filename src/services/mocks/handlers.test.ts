import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { setupServer } from 'msw/node'

import {
  attendanceRecordSchema,
  meResponseSchema,
  verifyOtpResponseSchema,
} from '../../types/schemas'
import { handlers } from './handlers'
import { seedStore } from './seed'

const server = setupServer(...handlers)

const BASE = 'http://localhost/api'

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

describe('auth handlers', () => {
  it('POST /auth/request-otp returns ok for any phone', async () => {
    const res = await fetch(`${BASE}/auth/request-otp`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ phone: '+923001000001' }),
    })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
  })

  it('POST /auth/verify-otp returns a token + canonical User for a known phone', async () => {
    const parent = seedStore.users.find((u) => u.role === 'parent')!
    const res = await fetch(`${BASE}/auth/verify-otp`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ phone: parent.phone, otp: '1234' }),
    })
    expect(res.status).toBe(200)
    const parsed = verifyOtpResponseSchema.parse(await res.json())
    expect(parsed.user.id).toBe(parent.id)
    expect(parsed.token).toMatch(/^tok_/)
  })

  it('POST /auth/verify-otp rejects unknown phones with 401', async () => {
    const res = await fetch(`${BASE}/auth/verify-otp`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ phone: '+999000', otp: '1234' }),
    })
    expect(res.status).toBe(401)
  })
})

describe('GET /me', () => {
  it('returns the user and their children for a parent', async () => {
    const parent = seedStore.users.find((u) => u.role === 'parent')!
    const res = await fetch(`${BASE}/me`, {
      headers: { authorization: `Bearer tok_${parent.id}` },
    })
    expect(res.status).toBe(200)
    const parsed = meResponseSchema.parse(await res.json())
    expect(parsed.user.id).toBe(parent.id)
    expect(parsed.school.id).toBe(seedStore.school.id)
    expect(parsed.children).toBeDefined()
    expect(parsed.children!.length).toBeGreaterThan(0)
    for (const child of parsed.children!) {
      expect(child.guardianIds).toContain(parent.id)
    }
  })

  it('returns the user without children for an admin', async () => {
    const admin = seedStore.users.find((u) => u.role === 'admin')!
    const res = await fetch(`${BASE}/me`, {
      headers: { authorization: `Bearer tok_${admin.id}` },
    })
    const parsed = meResponseSchema.parse(await res.json())
    expect(parsed.children).toBeUndefined()
  })

  it('returns 401 without a token', async () => {
    const res = await fetch(`${BASE}/me`)
    expect(res.status).toBe(401)
  })
})

describe('students timeline', () => {
  it('returns AttendanceRecord[] for a known student, newest first', async () => {
    const student = seedStore.students[0]!
    const res = await fetch(`${BASE}/students/${student.id}/timeline`)
    expect(res.status).toBe(200)
    const body = (await res.json()) as unknown[]
    expect(Array.isArray(body)).toBe(true)
    expect(body.length).toBeGreaterThan(0)

    // Every record validates against the canonical schema.
    for (const record of body) {
      attendanceRecordSchema.parse(record)
    }

    // Records are scoped to the requested student.
    expect((body[0] as { studentId: string }).studentId).toBe(student.id)

    // Ordering: dates strictly non-increasing.
    const dates = body.map((b) => (b as { date: string }).date)
    for (let i = 1; i < dates.length; i += 1) {
      expect(dates[i]! <= dates[i - 1]!).toBe(true)
    }
  })
})
