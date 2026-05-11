// MSW handlers — every endpoint in README §6. Real backend swap-in only
// changes VITE_API_BASE_URL + disabling the worker; URL shapes stay identical.

import { delay, http, HttpResponse } from 'msw'

import type { AttendanceRecord, Card, CardAuditEntry, TapEvent, User } from '../../types/schemas'
import {
  assignCardRequestSchema,
  manualTapEventRequestSchema,
  notificationSettingsSchema,
  patchCardRequestSchema,
  replaceCardRequestSchema,
  requestOtpRequestSchema,
  simulateTapRequestSchema,
  verifyOtpRequestSchema,
} from '../../types/schemas'
import { seedStore } from './seed'

// Prefix with '*' so handlers match any origin — needed for node tests
// (msw/node) and harmless in the browser where requests are same-origin.
const API = '*/api'

// Realistic-feeling latency. OTP endpoints simulate network round-trip.
async function latency(min = 80, max = 220): Promise<void> {
  const ms = Math.floor(min + Math.random() * (max - min))
  await delay(ms)
}

function tokenFor(userId: string): string {
  return `tok_${userId}`
}

function userIdFromToken(token: string | null): string | null {
  if (!token) return null
  const m = token.match(/^Bearer\s+tok_(.+)$/)
  return m?.[1] ?? null
}

function currentUser(request: Request): User | null {
  const id = userIdFromToken(request.headers.get('authorization'))
  if (!id) return null
  return seedStore.users.find((u) => u.id === id) ?? null
}

function appendAudit(
  card: Card,
  request: Request,
  action: CardAuditEntry['action'],
  note?: string,
): void {
  const me = currentUser(request)
  card.auditLog = [
    ...card.auditLog,
    {
      at: new Date().toISOString(),
      byUserId: me?.id ?? 'system',
      action,
      ...(note ? { note } : {}),
    },
  ]
}

export const handlers = [
  // --- Auth ---------------------------------------------------------------

  http.post(`${API}/auth/request-otp`, async ({ request }) => {
    await latency(200, 500)
    const body = requestOtpRequestSchema.safeParse(await request.json())
    if (!body.success) {
      return HttpResponse.json({ error: 'Invalid phone' }, { status: 400 })
    }
    // Always respond ok — do not leak whether the phone is registered.
    return HttpResponse.json({ ok: true })
  }),

  http.post(`${API}/auth/verify-otp`, async ({ request }) => {
    await latency(200, 500)
    const body = verifyOtpRequestSchema.safeParse(await request.json())
    if (!body.success) {
      return HttpResponse.json({ error: 'Invalid request' }, { status: 400 })
    }
    const user = seedStore.users.find((u) => u.phone === body.data.phone)
    if (!user) {
      return HttpResponse.json({ error: 'Unknown phone' }, { status: 401 })
    }
    // README §7: any 4-digit OTP is valid in dev.
    return HttpResponse.json({ token: tokenFor(user.id), user })
  }),

  http.get(`${API}/me`, async ({ request }) => {
    await latency()
    const user = currentUser(request)
    if (!user) return HttpResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const school = seedStore.school
    if (user.role === 'parent') {
      const children = seedStore.students.filter((s) => s.guardianIds.includes(user.id))
      return HttpResponse.json({ user, school, children })
    }
    return HttpResponse.json({ user, school })
  }),

  // --- Students -----------------------------------------------------------

  http.get(`${API}/students`, async ({ request }) => {
    await latency()
    const url = new URL(request.url)
    const classId = url.searchParams.get('classId')
    const search = url.searchParams.get('search')?.toLowerCase() ?? ''
    const guardianId = url.searchParams.get('guardianId')

    let result = seedStore.students
    if (classId) result = result.filter((s) => s.classId === classId)
    if (guardianId) {
      const me = currentUser(request)
      const id = guardianId === 'me' ? me?.id : guardianId
      if (!id) return HttpResponse.json({ error: 'Unauthorized' }, { status: 401 })
      result = result.filter((s) => s.guardianIds.includes(id))
    }
    if (search) {
      result = result.filter(
        (s) =>
          s.fullName.toLowerCase().includes(search) || s.rollNumber.toLowerCase().includes(search),
      )
    }
    return HttpResponse.json(result)
  }),

  http.get(`${API}/students/:id`, async ({ params }) => {
    await latency()
    const student = seedStore.students.find((s) => s.id === params.id)
    if (!student) return HttpResponse.json({ error: 'Not found' }, { status: 404 })
    const guardians = seedStore.users.filter((u) => student.guardianIds.includes(u.id))
    return HttpResponse.json({ ...student, guardians })
  }),

  http.get(`${API}/students/:id/timeline`, async ({ request, params }) => {
    await latency()
    const url = new URL(request.url)
    const from = url.searchParams.get('from')
    const to = url.searchParams.get('to')
    let result: AttendanceRecord[] = seedStore.attendance.filter((a) => a.studentId === params.id)
    if (from) result = result.filter((a) => a.date >= from)
    if (to) result = result.filter((a) => a.date <= to)
    result = [...result].sort((a, b) => (a.date < b.date ? 1 : -1))
    return HttpResponse.json(result)
  }),

  // --- Classes ------------------------------------------------------------

  http.get(`${API}/classes`, async () => {
    await latency()
    return HttpResponse.json(seedStore.classes)
  }),

  http.get(`${API}/classes/:id/attendance`, async ({ request, params }) => {
    await latency()
    const url = new URL(request.url)
    const date = url.searchParams.get('date')
    const studentIds = new Set(
      seedStore.students.filter((s) => s.classId === params.id).map((s) => s.id),
    )
    let result = seedStore.attendance.filter((a) => studentIds.has(a.studentId))
    if (date) result = result.filter((a) => a.date === date)
    return HttpResponse.json(result)
  }),

  // --- Cards --------------------------------------------------------------

  http.get(`${API}/cards`, async ({ request }) => {
    await latency()
    const status = new URL(request.url).searchParams.get('status') as Card['status'] | null
    const result = status ? seedStore.cards.filter((c) => c.status === status) : seedStore.cards
    return HttpResponse.json(result)
  }),

  http.post(`${API}/cards/assign`, async ({ request }) => {
    await latency()
    const body = assignCardRequestSchema.safeParse(await request.json())
    if (!body.success) return HttpResponse.json({ error: 'Invalid body' }, { status: 400 })
    const card = seedStore.cards.find((c) => c.id === body.data.cardId)
    const student = seedStore.students.find((s) => s.id === body.data.studentId)
    if (!card || !student) return HttpResponse.json({ error: 'Not found' }, { status: 404 })
    card.studentId = student.id
    card.status = 'active'
    student.cardId = card.id
    appendAudit(card, request, 'assigned', `Assigned to ${student.fullName}`)
    return HttpResponse.json(card)
  }),

  http.post(`${API}/cards/replace`, async ({ request }) => {
    await latency()
    const body = replaceCardRequestSchema.safeParse(await request.json())
    if (!body.success) return HttpResponse.json({ error: 'Invalid body' }, { status: 400 })
    const student = seedStore.students.find((s) => s.id === body.data.studentId)
    if (!student) return HttpResponse.json({ error: 'Not found' }, { status: 404 })

    const oldCard = seedStore.cards.find((c) => c.id === student.cardId)
    if (oldCard) {
      oldCard.status = 'replaced'
      appendAudit(oldCard, request, 'replaced', `Replaced by new card`)
    }

    const newCard: Card = {
      id: `crd_${seedStore.cards.length + 1}`,
      rfidUid: body.data.newRfidUid,
      studentId: student.id,
      status: 'active',
      issuedAt: new Date().toISOString(),
      auditLog: [],
    }
    appendAudit(newCard, request, 'issued', `Issued to ${student.fullName}`)
    seedStore.cards.push(newCard)
    student.cardId = newCard.id
    return HttpResponse.json(newCard)
  }),

  http.patch(`${API}/cards/:id`, async ({ request, params }) => {
    await latency()
    const body = patchCardRequestSchema.safeParse(await request.json())
    if (!body.success) return HttpResponse.json({ error: 'Invalid body' }, { status: 400 })
    const card = seedStore.cards.find((c) => c.id === params.id)
    if (!card) return HttpResponse.json({ error: 'Not found' }, { status: 404 })
    const previousStatus = card.status
    card.status = body.data.status
    // Map the new status to an audit action. Reactivating from lost or
    // deactivated maps to 'reactivated'; otherwise mirror the status name.
    const auditAction: CardAuditEntry['action'] =
      body.data.status === 'active' && previousStatus !== 'active'
        ? 'reactivated'
        : body.data.status === 'lost'
          ? 'lost'
          : body.data.status === 'deactivated'
            ? 'deactivated'
            : 'assigned'
    appendAudit(
      card,
      request,
      auditAction,
      `Status changed: ${previousStatus} → ${body.data.status}`,
    )
    return HttpResponse.json(card)
  }),

  // --- Devices ------------------------------------------------------------

  http.get(`${API}/devices`, async () => {
    await latency()
    return HttpResponse.json(seedStore.devices)
  }),

  http.get(`${API}/devices/:id`, async ({ params }) => {
    await latency()
    const device = seedStore.devices.find((d) => d.id === params.id)
    if (!device) return HttpResponse.json({ error: 'Not found' }, { status: 404 })
    return HttpResponse.json(device)
  }),

  // --- Tap events ---------------------------------------------------------

  http.get(`${API}/tap-events`, async ({ request }) => {
    await latency()
    const url = new URL(request.url)
    const from = url.searchParams.get('from')
    const to = url.searchParams.get('to')
    const studentId = url.searchParams.get('studentId')

    let result = seedStore.tapEvents
    if (studentId) {
      const cardIdsForStudent = new Set(
        seedStore.cards.filter((c) => c.studentId === studentId).map((c) => c.id),
      )
      result = result.filter((e) => cardIdsForStudent.has(e.cardId))
    }
    if (from) result = result.filter((e) => e.occurredAt >= from)
    if (to) result = result.filter((e) => e.occurredAt <= to)
    result = [...result].sort((a, b) => (a.occurredAt < b.occurredAt ? 1 : -1))
    return HttpResponse.json(result)
  }),

  http.post(`${API}/tap-events/manual`, async ({ request }) => {
    await latency()
    const me = currentUser(request)
    if (!me) return HttpResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const body = manualTapEventRequestSchema.safeParse(await request.json())
    if (!body.success) return HttpResponse.json({ error: 'Invalid body' }, { status: 400 })
    const student = seedStore.students.find((s) => s.id === body.data.studentId)
    if (!student) return HttpResponse.json({ error: 'Student not found' }, { status: 404 })
    const card = seedStore.cards.find((c) => c.id === student.cardId)
    if (!card) return HttpResponse.json({ error: 'Student has no card' }, { status: 400 })

    const event: TapEvent = {
      id: `tap_manual_${Date.now()}`,
      cardId: card.id,
      rfidUid: card.rfidUid,
      deviceId: 'dev_main',
      direction: body.data.direction,
      occurredAt: body.data.occurredAt,
      source: 'manual',
      manualOverrideBy: me.id,
      manualReason: body.data.reason,
    }
    seedStore.tapEvents.push(event)
    return HttpResponse.json(event)
  }),

  // --- Attendance ---------------------------------------------------------

  http.get(`${API}/attendance`, async ({ request }) => {
    await latency()
    const url = new URL(request.url)
    const date = url.searchParams.get('date')
    const from = url.searchParams.get('from')
    const to = url.searchParams.get('to')
    const classId = url.searchParams.get('classId')

    let result = seedStore.attendance
    if (date) result = result.filter((a) => a.date === date)
    if (from) result = result.filter((a) => a.date >= from)
    if (to) result = result.filter((a) => a.date <= to)
    if (classId) {
      const studentIds = new Set(
        seedStore.students.filter((s) => s.classId === classId).map((s) => s.id),
      )
      result = result.filter((a) => studentIds.has(a.studentId))
    }
    return HttpResponse.json(result)
  }),

  // --- Reports ------------------------------------------------------------

  http.get(`${API}/reports/attendance.csv`, async ({ request }) => {
    await latency(300, 600)
    const url = new URL(request.url)
    const from = url.searchParams.get('from')
    const to = url.searchParams.get('to')
    const classId = url.searchParams.get('classId')

    let rows = seedStore.attendance
    if (from) rows = rows.filter((a) => a.date >= from)
    if (to) rows = rows.filter((a) => a.date <= to)
    if (classId) {
      const studentIds = new Set(
        seedStore.students.filter((s) => s.classId === classId).map((s) => s.id),
      )
      rows = rows.filter((a) => studentIds.has(a.studentId))
    }
    const studentById = new Map(seedStore.students.map((s) => [s.id, s]))
    const header = 'date,student_id,student_name,status,first_in,last_out'
    const body = rows
      .map((r) => {
        const s = studentById.get(r.studentId)
        return [
          r.date,
          r.studentId,
          s?.fullName ?? '',
          r.status,
          r.firstInAt ?? '',
          r.lastOutAt ?? '',
        ].join(',')
      })
      .join('\n')
    return new HttpResponse(`${header}\n${body}\n`, {
      headers: { 'content-type': 'text/csv; charset=utf-8' },
    })
  }),

  // --- Notifications ------------------------------------------------------

  http.get(`${API}/notifications`, async ({ request }) => {
    await latency()
    const url = new URL(request.url)
    const userId = url.searchParams.get('userId')
    const status = url.searchParams.get('status')
    const me = currentUser(request)
    if (!me) return HttpResponse.json({ error: 'Unauthorized' }, { status: 401 })

    let result: typeof seedStore.notifications = seedStore.notifications
    // Admin / teacher can see all (no userId scoping); parents are scoped to
    // themselves regardless of what they pass.
    const target = userId === 'me' ? me.id : userId
    if (me.role === 'parent') {
      result = result.filter((n) => n.recipientUserId === me.id)
    } else if (target) {
      result = result.filter((n) => n.recipientUserId === target)
    }
    if (status) result = result.filter((n) => n.status === status)
    // Newest first.
    result = [...result].sort((a, b) => ((a.sentAt ?? '') < (b.sentAt ?? '') ? 1 : -1))
    return HttpResponse.json(result)
  }),

  http.post(`${API}/notifications/:id/retry`, async ({ params, request }) => {
    await latency()
    const me = currentUser(request)
    if (!me) return HttpResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (me.role === 'parent') {
      return HttpResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    const notif = seedStore.notifications.find((n) => n.id === params.id)
    if (!notif) return HttpResponse.json({ error: 'Not found' }, { status: 404 })
    notif.status = 'sent'
    notif.sentAt = new Date().toISOString()
    return HttpResponse.json(notif)
  }),

  http.patch(`${API}/notifications/settings`, async ({ request }) => {
    await latency()
    const me = currentUser(request)
    if (!me) return HttpResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const body = notificationSettingsSchema.safeParse(await request.json())
    if (!body.success) return HttpResponse.json({ error: 'Invalid body' }, { status: 400 })
    seedStore.notificationSettings.set(me.id, body.data)
    return HttpResponse.json(body.data)
  }),

  // --- Dev-only -----------------------------------------------------------

  http.post(`${API}/dev/simulate-tap`, async ({ request }) => {
    await latency(40, 120)
    const body = simulateTapRequestSchema.safeParse(await request.json())
    if (!body.success) return HttpResponse.json({ error: 'Invalid body' }, { status: 400 })
    const card = seedStore.cards.find((c) => c.rfidUid === body.data.rfidUid)
    if (!card) return HttpResponse.json({ error: 'Unknown card' }, { status: 404 })
    const event: TapEvent = {
      id: `tap_sim_${Date.now()}`,
      cardId: card.id,
      rfidUid: card.rfidUid,
      deviceId: body.data.deviceId,
      direction: body.data.direction,
      occurredAt: new Date().toISOString(),
      source: 'device',
    }
    seedStore.tapEvents.push(event)
    return HttpResponse.json(event)
  }),
]
