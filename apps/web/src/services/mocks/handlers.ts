// MSW handlers — every endpoint in README §6. Real backend swap-in only
// changes VITE_API_BASE_URL + disabling the worker; URL shapes stay identical.

import { delay, http, HttpResponse } from 'msw'
import { formatInTimeZone } from 'date-fns-tz'

import type {
  AttendanceRecord,
  Card,
  CardAuditEntry,
  Device,
  DeviceToken,
  Holiday,
  TapEvent,
  User,
} from '@fyntra/schemas'
import {
  assignCardRequestSchema,
  createDeviceRequestSchema,
  createDeviceTokenRequestSchema,
  createHolidayRequestSchema,
  manualTapEventRequestSchema,
  notificationSettingsSchema,
  patchCardRequestSchema,
  patchDeviceRequestSchema,
  patchHolidayRequestSchema,
  patchSchoolRequestSchema,
  registerLockRequestSchema,
  registerUnlockRequestSchema,
  replaceCardRequestSchema,
  requestOtpRequestSchema,
  simulateTapRequestSchema,
  verifyOtpRequestSchema,
} from '@fyntra/schemas'
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
    if (user.role === 'teacher') {
      const assignedClass = seedStore.classes.find((c) => c.teacherId === user.id)
      return HttpResponse.json({
        user,
        school,
        ...(assignedClass ? { assignedClass } : {}),
      })
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

  http.post(`${API}/classes/:id/register/lock`, async ({ params, request }) => {
    await latency()
    const me = currentUser(request)
    if (!me) return HttpResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const body = registerLockRequestSchema.safeParse(await request.json())
    if (!body.success) return HttpResponse.json({ error: 'Invalid body' }, { status: 400 })
    const klass = seedStore.classes.find((c) => c.id === params.id)
    if (!klass) return HttpResponse.json({ error: 'Not found' }, { status: 404 })
    // Mirrors the api: admin OR class-teacher only.
    if (me.role !== 'admin' && !(me.role === 'teacher' && klass.teacherId === me.id)) {
      return HttpResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    const { date } = body.data
    const classStudents = seedStore.students.filter((s) => s.classId === params.id && s.status === 'active')
    const lockedAt = new Date().toISOString()
    // Backfill `absent` rows for any student without a record.
    for (const s of classStudents) {
      let record = seedStore.attendance.find((a) => a.studentId === s.id && a.date === date)
      if (!record) {
        record = {
          id: `att_${s.id}_${date}`,
          studentId: s.id,
          date,
          status: 'absent',
          isManual: true,
        }
        seedStore.attendance.push(record)
      }
      // Lock the row idempotently — don't churn lockedAt/lockedBy if already set.
      if (!record.lockedAt) {
        record.lockedAt = lockedAt
        record.lockedBy = me.id
      }
    }
    const studentIds = new Set(classStudents.map((s) => s.id))
    const records = seedStore.attendance.filter((a) => studentIds.has(a.studentId) && a.date === date)
    const earliestLockedAt = records.reduce<string>(
      (acc, r) => (r.lockedAt && r.lockedAt < acc ? r.lockedAt : acc),
      lockedAt,
    )
    const firstLockedBy = records.find((r) => r.lockedBy)?.lockedBy ?? me.id
    return HttpResponse.json({
      classId: params.id,
      date,
      lockedAt: earliestLockedAt,
      lockedBy: firstLockedBy,
      records,
    })
  }),

  http.post(`${API}/classes/:id/register/unlock`, async ({ params, request }) => {
    await latency()
    const me = currentUser(request)
    if (!me) return HttpResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (me.role !== 'admin') return HttpResponse.json({ error: 'Forbidden' }, { status: 403 })
    const body = registerUnlockRequestSchema.safeParse(await request.json())
    if (!body.success) return HttpResponse.json({ error: 'Invalid body' }, { status: 400 })
    const klass = seedStore.classes.find((c) => c.id === params.id)
    if (!klass) return HttpResponse.json({ error: 'Not found' }, { status: 404 })
    const { date } = body.data
    const classStudentIds = new Set(
      seedStore.students.filter((s) => s.classId === params.id).map((s) => s.id),
    )
    for (const record of seedStore.attendance) {
      if (classStudentIds.has(record.studentId) && record.date === date) {
        record.lockedAt = undefined
        record.lockedBy = undefined
      }
    }
    return HttpResponse.json({ ok: true })
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

  http.post(`${API}/devices`, async ({ request }) => {
    await latency()
    const body = createDeviceRequestSchema.safeParse(await request.json())
    if (!body.success) return HttpResponse.json({ error: 'Invalid body' }, { status: 400 })
    const device: Device = {
      id: `dev_${Date.now().toString(36)}_${Math.floor(Math.random() * 1_000_000).toString(36)}`,
      schoolId: seedStore.school.id,
      label: body.data.label,
      direction: body.data.direction,
      status: 'offline',
      lastHeartbeat: new Date().toISOString(),
    }
    seedStore.devices.push(device)
    return HttpResponse.json(device)
  }),

  http.patch(`${API}/devices/:id`, async ({ params, request }) => {
    await latency()
    const body = patchDeviceRequestSchema.safeParse(await request.json())
    if (!body.success) return HttpResponse.json({ error: 'Invalid body' }, { status: 400 })
    const device = seedStore.devices.find((d) => d.id === params.id)
    if (!device) return HttpResponse.json({ error: 'Not found' }, { status: 404 })
    if (body.data.label !== undefined) device.label = body.data.label
    if (body.data.direction !== undefined) device.direction = body.data.direction
    return HttpResponse.json(device)
  }),

  http.delete(`${API}/devices/:id`, async ({ params }) => {
    await latency()
    const idx = seedStore.devices.findIndex((d) => d.id === params.id)
    if (idx === -1) return HttpResponse.json({ error: 'Not found' }, { status: 404 })
    // Drop from GET response and cascade-revoke tokens to mirror the api's
    // soft-delete behaviour.
    seedStore.devices.splice(idx, 1)
    seedStore.deviceTokens = seedStore.deviceTokens.filter((t) => t.deviceId !== params.id)
    return HttpResponse.json({ ok: true })
  }),

  http.get(`${API}/devices/:id/tokens`, async ({ params }) => {
    await latency()
    const device = seedStore.devices.find((d) => d.id === params.id)
    if (!device) return HttpResponse.json({ error: 'Not found' }, { status: 404 })
    const tokens = seedStore.deviceTokens.filter((t) => t.deviceId === params.id)
    return HttpResponse.json(tokens)
  }),

  http.post(`${API}/devices/:id/tokens`, async ({ params, request }) => {
    await latency()
    const device = seedStore.devices.find((d) => d.id === params.id)
    if (!device) return HttpResponse.json({ error: 'Not found' }, { status: 404 })
    const body = createDeviceTokenRequestSchema.safeParse(await request.json())
    if (!body.success) return HttpResponse.json({ error: 'Invalid body' }, { status: 400 })
    const plaintext = `dtk_${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`
    const deviceToken: DeviceToken = {
      id: `dtk_${Date.now().toString(36)}_${Math.floor(Math.random() * 1_000_000).toString(36)}`,
      deviceId: device.id,
      label: body.data.label,
      createdAt: new Date().toISOString(),
    }
    seedStore.deviceTokens.push(deviceToken)
    return HttpResponse.json({ token: plaintext, deviceToken })
  }),

  http.delete(`${API}/devices/:id/tokens/:tokenId`, async ({ params }) => {
    await latency()
    const token = seedStore.deviceTokens.find(
      (t) => t.id === params.tokenId && t.deviceId === params.id,
    )
    if (!token) return HttpResponse.json({ error: 'Not found' }, { status: 404 })
    token.revokedAt = new Date().toISOString()
    return HttpResponse.json(token)
  }),

  // --- Holidays -----------------------------------------------------------

  http.get(`${API}/holidays`, async ({ request }) => {
    await latency()
    const url = new URL(request.url)
    const from = url.searchParams.get('from') ?? undefined
    const to = url.searchParams.get('to') ?? undefined
    const rows = seedStore.holidays
      .filter((h) => (!from || h.date >= from) && (!to || h.date <= to))
      .sort((a, b) => a.date.localeCompare(b.date))
    return HttpResponse.json(rows)
  }),

  http.post(`${API}/holidays`, async ({ request }) => {
    await latency()
    const body = createHolidayRequestSchema.safeParse(await request.json())
    if (!body.success) return HttpResponse.json({ error: 'Invalid body' }, { status: 400 })
    if (seedStore.holidays.some((h) => h.date === body.data.date)) {
      return HttpResponse.json({ error: 'Already exists' }, { status: 409 })
    }
    const adminUser = seedStore.users.find((u) => u.role === 'admin')
    const holiday: Holiday = {
      id: `hol_${Date.now().toString(36)}_${Math.floor(Math.random() * 1_000_000).toString(36)}`,
      schoolId: seedStore.school.id,
      date: body.data.date,
      label: body.data.label,
      kind: body.data.kind,
      effectiveEndTime: body.data.effectiveEndTime,
      createdBy: adminUser?.id,
      createdAt: new Date().toISOString(),
    }
    seedStore.holidays.push(holiday)
    return HttpResponse.json(holiday)
  }),

  http.patch(`${API}/holidays/:id`, async ({ params, request }) => {
    await latency()
    const body = patchHolidayRequestSchema.safeParse(await request.json())
    if (!body.success) return HttpResponse.json({ error: 'Invalid body' }, { status: 400 })
    const h = seedStore.holidays.find((x) => x.id === params.id)
    if (!h) return HttpResponse.json({ error: 'Not found' }, { status: 404 })
    if (body.data.date !== undefined) h.date = body.data.date
    if (body.data.label !== undefined) h.label = body.data.label
    if (body.data.kind !== undefined) h.kind = body.data.kind
    if (body.data.effectiveEndTime !== undefined) h.effectiveEndTime = body.data.effectiveEndTime
    // Clear effectiveEndTime when kind moved away from half_day, matching the api.
    if (h.kind !== 'half_day') h.effectiveEndTime = undefined
    return HttpResponse.json(h)
  }),

  http.delete(`${API}/holidays/:id`, async ({ params }) => {
    await latency()
    const idx = seedStore.holidays.findIndex((h) => h.id === params.id)
    if (idx === -1) return HttpResponse.json({ error: 'Not found' }, { status: 404 })
    seedStore.holidays.splice(idx, 1)
    return HttpResponse.json({ ok: true })
  }),

  // --- School policy ------------------------------------------------------

  http.patch(`${API}/schools/me`, async ({ request }) => {
    await latency()
    const body = patchSchoolRequestSchema.safeParse(await request.json())
    if (!body.success) return HttpResponse.json({ error: 'Invalid body' }, { status: 400 })
    const s = seedStore.school
    if (body.data.startTime !== undefined) s.startTime = body.data.startTime
    if (body.data.endTime !== undefined) s.endTime = body.data.endTime
    if (body.data.lateThresholdMinutes !== undefined) s.lateThresholdMinutes = body.data.lateThresholdMinutes
    if (body.data.absentThresholdMinutes !== undefined) s.absentThresholdMinutes = body.data.absentThresholdMinutes
    if (body.data.workingDays !== undefined) s.workingDays = body.data.workingDays
    if (body.data.halfDayCutoffTime !== undefined) {
      s.halfDayCutoffTime = body.data.halfDayCutoffTime ?? undefined
    }
    if (body.data.academicYearStart !== undefined) {
      s.academicYearStart = body.data.academicYearStart ?? undefined
    }
    if (body.data.academicYearEnd !== undefined) {
      s.academicYearEnd = body.data.academicYearEnd ?? undefined
    }
    return HttpResponse.json(s)
  }),

  // --- Tap events ---------------------------------------------------------

  http.get(`${API}/tap-events`, async ({ request }) => {
    await latency()
    const url = new URL(request.url)
    const from = url.searchParams.get('from')
    const to = url.searchParams.get('to')
    const studentId = url.searchParams.get('studentId')
    const cursor = url.searchParams.get('cursor')
    const limitRaw = Number(url.searchParams.get('limit') ?? '100')
    const limit = Math.max(1, Math.min(500, Number.isFinite(limitRaw) ? limitRaw : 100))

    let result = seedStore.tapEvents
    if (studentId) {
      const cardIdsForStudent = new Set(
        seedStore.cards.filter((c) => c.studentId === studentId).map((c) => c.id),
      )
      result = result.filter((e) => e.cardId !== undefined && cardIdsForStudent.has(e.cardId))
    }
    if (from) result = result.filter((e) => e.occurredAt >= from)
    if (to) result = result.filter((e) => e.occurredAt <= to)

    // Newest-first by occurredAt. We paginate by `id` matching the api side:
    // when a cursor is supplied, return rows strictly older than the cursor
    // row in the sorted order.
    const sorted = [...result].sort((a, b) => (a.occurredAt < b.occurredAt ? 1 : -1))
    let startIdx = 0
    if (cursor) {
      const idx = sorted.findIndex((e) => e.id === cursor)
      startIdx = idx >= 0 ? idx + 1 : sorted.length
    }
    const page = sorted.slice(startIdx, startIdx + limit)
    const hasMore = startIdx + limit < sorted.length
    const headers: Record<string, string> = {}
    if (hasMore && page.length > 0) headers['x-next-cursor'] = page[page.length - 1]!.id
    return HttpResponse.json(page, { headers })
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

    // Locked-day gate: non-admin overrides on locked records → 409.
    const recordDateForLockCheck = formatInTimeZone(
      new Date(body.data.occurredAt),
      'Asia/Karachi',
      'yyyy-MM-dd',
    )
    const existingForLock = seedStore.attendance.find(
      (a) => a.studentId === student.id && a.date === recordDateForLockCheck,
    )
    if (existingForLock?.lockedAt && me.role !== 'admin') {
      return HttpResponse.json({ error: 'Day is locked' }, { status: 409 })
    }

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
      manualReasonKind: body.data.reasonKind,
    }
    seedStore.tapEvents.push(event)

    // Reflect the override into the AttendanceRecord for that Karachi-local
    // day so the teacher roster updates immediately. In production, the
    // backend would re-derive — we shortcut here.
    const recordDate = formatInTimeZone(
      new Date(body.data.occurredAt),
      'Asia/Karachi',
      'yyyy-MM-dd',
    )
    let record = seedStore.attendance.find(
      (a) => a.studentId === student.id && a.date === recordDate,
    )
    if (!record) {
      record = {
        id: `att_${student.id}_${recordDate}`,
        studentId: student.id,
        date: recordDate,
        status: 'present',
        isManual: true,
      }
      seedStore.attendance.push(record)
    }
    if (body.data.direction === 'in') {
      record.firstInAt = body.data.occurredAt
      if (record.status === 'absent') record.status = 'present'
    } else {
      record.lastOutAt = body.data.occurredAt
    }
    record.isManual = true

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
    const anomalies = url.searchParams.get('anomalies')

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
    if (anomalies === 'true') {
      result = result.filter(
        (a) => a.cardAnomaly === true || a.leftWithoutScan === true || a.flaggedForReview === true,
      )
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

  http.get(`${API}/notifications/settings`, async ({ request }) => {
    await latency()
    const me = currentUser(request)
    if (!me) return HttpResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const settings = seedStore.notificationSettings.get(me.id)
    if (!settings) return HttpResponse.json({ error: 'Not found' }, { status: 404 })
    return HttpResponse.json(settings)
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
