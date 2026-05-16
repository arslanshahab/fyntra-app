import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { and, eq, isNull } from 'drizzle-orm'
import { buildApp } from '../../app.js'
import { truncateAll } from '../../../tests/helpers/db.js'
import { db } from '../../db/client.js'
import { schools } from '../../db/schema/schools.js'
import { users } from '../../db/schema/auth.js'
import { devices } from '../../db/schema/devices.js'
import { newId } from '../../lib/ids.js'
import { deviceTokenSchema } from '@fyntra/schemas'
import { resolveDeviceByToken } from '../readers/service.js'

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
  const deviceA = newId()
  const deviceB = newId()
  await db.insert(schools).values([
    { id: schoolA, name: 'A', address: 'a', startTime: '07:45', endTime: '13:30', lateThresholdMinutes: 10, absentThresholdMinutes: 30 },
    { id: schoolB, name: 'B', address: 'b', startTime: '07:45', endTime: '13:30', lateThresholdMinutes: 10, absentThresholdMinutes: 30 },
  ])
  await db.insert(users).values([
    { id: adminA, schoolId: schoolA, role: 'admin', fullName: 'AdminA', phone: '+923001100090', preferredLanguage: 'en' },
    { id: parentA, schoolId: schoolA, role: 'parent', fullName: 'ParentA', phone: '+923001100091', preferredLanguage: 'en' },
  ])
  await db.insert(devices).values([
    { id: deviceA, schoolId: schoolA, label: 'Main Gate', direction: 'both', status: 'offline' },
    { id: deviceB, schoolId: schoolB, label: 'Side Gate', direction: 'in', status: 'online' },
  ])
  return { schoolA, adminA, parentA, deviceA, deviceB }
}

function token(app: FastifyInstance, payload: { userId: string; schoolId: string; role: 'parent' | 'admin' | 'teacher' }) {
  return app.jwt.sign(payload, { expiresIn: '1h' })
}

describe('devices routes', () => {
  it('GET /devices returns only the caller school devices', async () => {
    const { schoolA, adminA, deviceA } = await seedTwoSchools()
    const t = token(app, { userId: adminA, schoolId: schoolA, role: 'admin' })
    const res = await app.inject({ method: 'GET', url: '/devices', headers: { authorization: `Bearer ${t}` } })
    expect(res.statusCode).toBe(200)
    const body = res.json() as Array<{ id: string; lastHeartbeat: string }>
    expect(body.map((d) => d.id)).toEqual([deviceA])
    // lastHeartbeat serialized as ISO string, not Date
    expect(typeof body[0]?.lastHeartbeat).toBe('string')
    expect(body[0]?.lastHeartbeat).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it('returns 404 when admin of school A fetches device of school B', async () => {
    const { schoolA, adminA, deviceB } = await seedTwoSchools()
    const t = token(app, { userId: adminA, schoolId: schoolA, role: 'admin' })
    const res = await app.inject({
      method: 'GET',
      url: `/devices/${deviceB}`,
      headers: { authorization: `Bearer ${t}` },
    })
    expect(res.statusCode).toBe(404)
  })

  it('admin can create a device', async () => {
    const { schoolA, adminA } = await seedTwoSchools()
    const t = token(app, { userId: adminA, schoolId: schoolA, role: 'admin' })
    const res = await app.inject({
      method: 'POST',
      url: '/devices',
      headers: { authorization: `Bearer ${t}` },
      payload: { label: 'New Gate', direction: 'out' },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json() as { id: string; label: string; direction: string; schoolId: string }
    expect(body.label).toBe('New Gate')
    expect(body.direction).toBe('out')
    expect(body.schoolId).toBe(schoolA)
    const rows = await db
      .select()
      .from(devices)
      .where(and(eq(devices.id, body.id), isNull(devices.deletedAt)))
    expect(rows).toHaveLength(1)
    expect(rows[0]?.deletedAt).toBeNull()
  })

  it('parent cannot create a device (403)', async () => {
    const { schoolA, parentA } = await seedTwoSchools()
    const t = token(app, { userId: parentA, schoolId: schoolA, role: 'parent' })
    const res = await app.inject({
      method: 'POST',
      url: '/devices',
      headers: { authorization: `Bearer ${t}` },
      payload: { label: 'Nope', direction: 'in' },
    })
    expect(res.statusCode).toBe(403)
  })

  it('admin of A patching device of B returns 404', async () => {
    const { schoolA, adminA, deviceB } = await seedTwoSchools()
    const t = token(app, { userId: adminA, schoolId: schoolA, role: 'admin' })
    const res = await app.inject({
      method: 'PATCH',
      url: `/devices/${deviceB}`,
      headers: { authorization: `Bearer ${t}` },
      payload: { label: 'Hijacked' },
    })
    expect(res.statusCode).toBe(404)
  })

  it('admin of A soft-deleting device of B returns 404', async () => {
    const { schoolA, adminA, deviceB } = await seedTwoSchools()
    const t = token(app, { userId: adminA, schoolId: schoolA, role: 'admin' })
    const res = await app.inject({
      method: 'DELETE',
      url: `/devices/${deviceB}`,
      headers: { authorization: `Bearer ${t}` },
    })
    expect(res.statusCode).toBe(404)
  })

  it('issuing a token returns plaintext once; listing hides it', async () => {
    const { schoolA, adminA, deviceA } = await seedTwoSchools()
    const t = token(app, { userId: adminA, schoolId: schoolA, role: 'admin' })
    const issueRes = await app.inject({
      method: 'POST',
      url: `/devices/${deviceA}/tokens`,
      headers: { authorization: `Bearer ${t}` },
      payload: { label: 'gate-1' },
    })
    expect(issueRes.statusCode).toBe(200)
    const issueBody = issueRes.json() as {
      token: string
      deviceToken: { id: string; deviceId: string; label: string; createdAt: string; revokedAt?: string }
    }
    expect(typeof issueBody.token).toBe('string')
    expect(issueBody.token.length).toBeGreaterThan(20)
    expect(issueBody.deviceToken.deviceId).toBe(deviceA)
    expect(issueBody.deviceToken.label).toBe('gate-1')

    const listRes = await app.inject({
      method: 'GET',
      url: `/devices/${deviceA}/tokens`,
      headers: { authorization: `Bearer ${t}` },
    })
    expect(listRes.statusCode).toBe(200)
    const listBody = listRes.json() as unknown[]
    expect(listBody).toHaveLength(1)
    const row = listBody[0] as Record<string, unknown>
    // No plaintext token field on the listing row.
    expect('token' in row).toBe(false)
    expect('tokenHash' in row).toBe(false)
    // Conforms to the wire shape.
    expect(() => deviceTokenSchema.parse(row)).not.toThrow()
  })

  it('revoking a token causes resolveDeviceByToken to return null', async () => {
    const { schoolA, adminA, deviceA } = await seedTwoSchools()
    const t = token(app, { userId: adminA, schoolId: schoolA, role: 'admin' })
    const issueRes = await app.inject({
      method: 'POST',
      url: `/devices/${deviceA}/tokens`,
      headers: { authorization: `Bearer ${t}` },
      payload: { label: 'gate-1' },
    })
    expect(issueRes.statusCode).toBe(200)
    const issueBody = issueRes.json() as { token: string; deviceToken: { id: string } }
    const plaintext = issueBody.token
    const tokenId = issueBody.deviceToken.id

    // Sanity: resolves before revoke.
    const before = await resolveDeviceByToken(plaintext)
    expect(before?.deviceId).toBe(deviceA)

    const delRes = await app.inject({
      method: 'DELETE',
      url: `/devices/${deviceA}/tokens/${tokenId}`,
      headers: { authorization: `Bearer ${t}` },
    })
    expect(delRes.statusCode).toBe(200)
    const delBody = delRes.json() as { id: string; revokedAt?: string }
    expect(delBody.id).toBe(tokenId)
    expect(typeof delBody.revokedAt).toBe('string')

    const after = await resolveDeviceByToken(plaintext)
    expect(after).toBeNull()
  })

  it('soft-deleting a device cascade-revokes its tokens', async () => {
    const { schoolA, adminA, deviceA } = await seedTwoSchools()
    const t = token(app, { userId: adminA, schoolId: schoolA, role: 'admin' })
    const issueRes = await app.inject({
      method: 'POST',
      url: `/devices/${deviceA}/tokens`,
      headers: { authorization: `Bearer ${t}` },
      payload: { label: 'gate-1' },
    })
    expect(issueRes.statusCode).toBe(200)
    const plaintext = (issueRes.json() as { token: string }).token

    const before = await resolveDeviceByToken(plaintext)
    expect(before?.deviceId).toBe(deviceA)

    const delRes = await app.inject({
      method: 'DELETE',
      url: `/devices/${deviceA}`,
      headers: { authorization: `Bearer ${t}` },
    })
    expect(delRes.statusCode).toBe(200)
    expect(delRes.json()).toEqual({ ok: true })

    const after = await resolveDeviceByToken(plaintext)
    expect(after).toBeNull()
  })

  it('issuing a token for a cross-tenant device returns 404', async () => {
    const { schoolA, adminA, deviceB } = await seedTwoSchools()
    const t = token(app, { userId: adminA, schoolId: schoolA, role: 'admin' })
    const res = await app.inject({
      method: 'POST',
      url: `/devices/${deviceB}/tokens`,
      headers: { authorization: `Bearer ${t}` },
      payload: { label: 'hijack' },
    })
    expect(res.statusCode).toBe(404)
  })
})
