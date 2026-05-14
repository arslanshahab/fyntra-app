import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../../app.js'
import { truncateAll } from '../../../tests/helpers/db.js'
import { db } from '../../db/client.js'
import { schools } from '../../db/schema/schools.js'
import { users } from '../../db/schema/auth.js'
import { devices } from '../../db/schema/devices.js'
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
  const deviceA = newId()
  const deviceB = newId()
  await db.insert(schools).values([
    { id: schoolA, name: 'A', address: 'a', startTime: '07:45', endTime: '13:30', lateThresholdMinutes: 10, absentThresholdMinutes: 30 },
    { id: schoolB, name: 'B', address: 'b', startTime: '07:45', endTime: '13:30', lateThresholdMinutes: 10, absentThresholdMinutes: 30 },
  ])
  await db.insert(users).values({
    id: adminA, schoolId: schoolA, role: 'admin', fullName: 'AdminA', phone: '+923001100090', preferredLanguage: 'en',
  })
  await db.insert(devices).values([
    { id: deviceA, schoolId: schoolA, label: 'Main Gate', direction: 'both', status: 'offline' },
    { id: deviceB, schoolId: schoolB, label: 'Side Gate', direction: 'in', status: 'online' },
  ])
  return { schoolA, adminA, deviceA, deviceB }
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
})
