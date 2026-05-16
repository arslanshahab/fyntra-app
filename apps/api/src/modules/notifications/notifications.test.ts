import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../../app.js'
import { truncateAll } from '../../../tests/helpers/db.js'
import { db } from '../../db/client.js'
import { schools } from '../../db/schema/schools.js'
import { users } from '../../db/schema/auth.js'
import { notificationLogs, notificationSettings } from '../../db/schema/notifications.js'
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
  const adminA = newId()
  const adminB = newId()
  const parentA = newId()
  const otherParentA = newId()
  const parentB = newId()
  await db.insert(schools).values([
    { id: schoolA, name: 'A', address: 'a', startTime: '07:45', endTime: '13:30', lateThresholdMinutes: 10, absentThresholdMinutes: 30 },
    { id: schoolB, name: 'B', address: 'b', startTime: '07:45', endTime: '13:30', lateThresholdMinutes: 10, absentThresholdMinutes: 30 },
  ])
  await db.insert(users).values([
    { id: adminA, schoolId: schoolA, role: 'admin', fullName: 'AdminA', phone: '+923001100001', preferredLanguage: 'en' },
    { id: adminB, schoolId: schoolB, role: 'admin', fullName: 'AdminB', phone: '+923001100002', preferredLanguage: 'en' },
    { id: parentA, schoolId: schoolA, role: 'parent', fullName: 'ParentA', phone: '+923001000001', preferredLanguage: 'en' },
    { id: otherParentA, schoolId: schoolA, role: 'parent', fullName: 'OtherParentA', phone: '+923001000002', preferredLanguage: 'en' },
    { id: parentB, schoolId: schoolB, role: 'parent', fullName: 'ParentB', phone: '+923001000003', preferredLanguage: 'en' },
  ])
  return { schoolA, schoolB, adminA, adminB, parentA, otherParentA, parentB }
}

function token(app: FastifyInstance, payload: { userId: string; schoolId: string; role: 'parent' | 'admin' | 'teacher' }) {
  return app.jwt.sign(payload, { expiresIn: '1h' })
}

describe('notifications routes', () => {
  it('GET /notifications/settings auto-creates parent defaults with device_offline=false', async () => {
    const { schoolA, parentA } = await seedTwoSchools()
    const t = token(app, { userId: parentA, schoolId: schoolA, role: 'parent' })
    const res = await app.inject({
      method: 'GET',
      url: '/notifications/settings',
      headers: { authorization: `Bearer ${t}` },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json() as { channels: { whatsapp: boolean; sms: boolean; in_app: boolean }; events: { device_offline: boolean } }
    expect(body.events.device_offline).toBe(false)
    expect(body.channels.whatsapp).toBe(true)
    expect(body.channels.sms).toBe(false)
    expect(body.channels.in_app).toBe(true)

    const rows = await db
      .select()
      .from(notificationSettings)
      .where(eq(notificationSettings.userId, parentA))
    expect(rows).toHaveLength(1)
    expect(rows[0]?.eventDeviceOffline).toBe(false)
  })

  it('PATCH /notifications/settings coerces parent device_offline=true to false', async () => {
    const { schoolA, parentA } = await seedTwoSchools()
    const t = token(app, { userId: parentA, schoolId: schoolA, role: 'parent' })
    const payload = {
      channels: { whatsapp: true, sms: false, in_app: true },
      events: {
        tap_in: true,
        tap_out: true,
        late: true,
        absent: true,
        manual_override: true,
        device_offline: true,
      },
    }
    // Auto-create row first
    await app.inject({
      method: 'GET',
      url: '/notifications/settings',
      headers: { authorization: `Bearer ${t}` },
    })
    const res = await app.inject({
      method: 'PATCH',
      url: '/notifications/settings',
      headers: { authorization: `Bearer ${t}` },
      payload,
    })
    expect(res.statusCode).toBe(200)
    const body = res.json() as { events: { device_offline: boolean } }
    expect(body.events.device_offline).toBe(false)

    const rows = await db
      .select()
      .from(notificationSettings)
      .where(eq(notificationSettings.userId, parentA))
    expect(rows[0]?.eventDeviceOffline).toBe(false)
  })

  it('GET /notifications scopes parents to their own logs and admins see all in school', async () => {
    const { schoolA, adminA, parentA, otherParentA } = await seedTwoSchools()
    const myLogId = newId()
    const otherLogId = newId()
    await db.insert(notificationLogs).values([
      {
        id: myLogId,
        schoolId: schoolA,
        recipientUserId: parentA,
        channel: 'in_app',
        eventId: null,
        status: 'sent',
        payload: { title: 'mine', body: 'm' },
        sentAt: new Date(),
      },
      {
        id: otherLogId,
        schoolId: schoolA,
        recipientUserId: otherParentA,
        channel: 'in_app',
        eventId: null,
        status: 'sent',
        payload: { title: 'other', body: 'o' },
        sentAt: new Date(),
      },
    ])

    const parentTok = token(app, { userId: parentA, schoolId: schoolA, role: 'parent' })
    const parentRes = await app.inject({
      method: 'GET',
      url: '/notifications',
      headers: { authorization: `Bearer ${parentTok}` },
    })
    expect(parentRes.statusCode).toBe(200)
    const parentBody = parentRes.json() as Array<{ id: string; recipientUserId: string }>
    expect(parentBody.map((r) => r.id)).toEqual([myLogId])

    const adminTok = token(app, { userId: adminA, schoolId: schoolA, role: 'admin' })
    const adminRes = await app.inject({
      method: 'GET',
      url: '/notifications',
      headers: { authorization: `Bearer ${adminTok}` },
    })
    expect(adminRes.statusCode).toBe(200)
    const adminBody = adminRes.json() as Array<{ id: string }>
    expect(adminBody.map((r) => r.id).sort()).toEqual([myLogId, otherLogId].sort())
  })

  it('POST /notifications/:id/retry cross-tenant returns 404', async () => {
    const { schoolA, schoolB, adminA, parentB } = await seedTwoSchools()
    const logBId = newId()
    await db.insert(notificationLogs).values({
      id: logBId,
      schoolId: schoolB,
      recipientUserId: parentB,
      channel: 'in_app',
      eventId: null,
      status: 'failed',
      payload: { title: 't', body: 'b' },
      sentAt: null,
    })

    const t = token(app, { userId: adminA, schoolId: schoolA, role: 'admin' })
    const res = await app.inject({
      method: 'POST',
      url: `/notifications/${logBId}/retry`,
      headers: { authorization: `Bearer ${t}` },
    })
    expect(res.statusCode).toBe(404)
  })

  it('POST /notifications/:id/retry marks the log sent within own tenant', async () => {
    const { schoolA, adminA, parentA } = await seedTwoSchools()
    const logId = newId()
    await db.insert(notificationLogs).values({
      id: logId,
      schoolId: schoolA,
      recipientUserId: parentA,
      channel: 'in_app',
      eventId: null,
      status: 'failed',
      payload: { title: 't', body: 'b' },
      sentAt: null,
    })

    const t = token(app, { userId: adminA, schoolId: schoolA, role: 'admin' })
    const res = await app.inject({
      method: 'POST',
      url: `/notifications/${logId}/retry`,
      headers: { authorization: `Bearer ${t}` },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json() as { status: string; sentAt?: string }
    expect(body.status).toBe('sent')
    expect(body.sentAt).toBeDefined()

    const rows = await db
      .select()
      .from(notificationLogs)
      .where(eq(notificationLogs.id, logId))
    expect(rows[0]?.status).toBe('sent')
    expect(rows[0]?.sentAt).not.toBeNull()
  })

  // --- cursor pagination ---

  async function seedLogs(schoolId: string, recipient: string, n: number) {
    const ids: string[] = []
    for (let i = 0; i < n; i++) {
      const id = newId()
      ids.push(id)
      await db.insert(notificationLogs).values({
        id,
        schoolId,
        recipientUserId: recipient,
        channel: 'in_app',
        eventId: null,
        status: 'sent',
        payload: { title: `t${i}`, body: `b${i}` },
        sentAt: new Date(),
      })
    }
    return ids
  }

  it('GET /notifications?limit=2 sets X-Next-Cursor to the last id of the page', async () => {
    const { schoolA, adminA, parentA } = await seedTwoSchools()
    const ids = await seedLogs(schoolA, parentA, 4)
    const t = token(app, { userId: adminA, schoolId: schoolA, role: 'admin' })
    const res = await app.inject({
      method: 'GET',
      url: '/notifications?limit=2',
      headers: { authorization: `Bearer ${t}` },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json() as Array<{ id: string }>
    expect(body).toHaveLength(2)
    expect(body[0]!.id).toBe(ids[3])
    expect(body[1]!.id).toBe(ids[2])
    expect(res.headers['x-next-cursor']).toBe(ids[2])
  })

  it('GET /notifications?cursor=<id> returns next page (short page omits cursor)', async () => {
    const { schoolA, adminA, parentA } = await seedTwoSchools()
    const ids = await seedLogs(schoolA, parentA, 4)
    const t = token(app, { userId: adminA, schoolId: schoolA, role: 'admin' })
    // 4 seeded, limit=3 starting after ids[2] → only ids[1], ids[0] remain → short page
    const res = await app.inject({
      method: 'GET',
      url: `/notifications?limit=3&cursor=${ids[2]}`,
      headers: { authorization: `Bearer ${t}` },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json() as Array<{ id: string }>
    expect(body).toHaveLength(2)
    expect(body[0]!.id).toBe(ids[1])
    expect(body[1]!.id).toBe(ids[0])
    expect(res.headers['x-next-cursor']).toBeUndefined()
  })

  it('POST /notifications/:id/retry on a whatsapp log re-sends and refreshes sentAt under dry-run', async () => {
    const { schoolA, adminA, parentA } = await seedTwoSchools()
    const logId = newId()
    await db.insert(notificationLogs).values({
      id: logId,
      schoolId: schoolA,
      recipientUserId: parentA,
      channel: 'whatsapp',
      eventId: null,
      status: 'failed',
      payload: {
        title: 'Arrived at school',
        body: 'Tap at 07:48',
        templateName: 'fyntra_tap_event',
        variables: ['Ali', '07:48'],
        errorMessage: 'previous send failed',
      },
      sentAt: null,
    })

    const before = Date.now()
    const t = token(app, { userId: adminA, schoolId: schoolA, role: 'admin' })
    const res = await app.inject({
      method: 'POST',
      url: `/notifications/${logId}/retry`,
      headers: { authorization: `Bearer ${t}` },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json() as { status: string; sentAt?: string }
    expect(body.status).toBe('sent')
    expect(body.sentAt).toBeDefined()

    const rows = await db
      .select()
      .from(notificationLogs)
      .where(eq(notificationLogs.id, logId))
    expect(rows[0]?.status).toBe('sent')
    expect(rows[0]?.sentAt).not.toBeNull()
    expect(rows[0]!.sentAt!.getTime()).toBeGreaterThanOrEqual(before)
  })
})
