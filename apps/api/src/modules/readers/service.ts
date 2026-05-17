import { and, eq, isNull } from 'drizzle-orm'
import { db } from '../../db/client.js'
import { users } from '../../db/schema/auth.js'
import { cards } from '../../db/schema/cards.js'
import { deviceTokens, devices } from '../../db/schema/devices.js'
import { students, studentGuardians } from '../../db/schema/students.js'
import { hashToken } from '../../lib/tokens.js'
import { NotFoundError, UnauthorizedError } from '../../lib/errors.js'
import { hhmmKarachi, ymdInKarachi } from '../../lib/time.js'
import { tapEventsRepo } from '../tap-events/repository.js'
import { recomputeAttendanceForDay } from '../attendance/service.js'
import { dispatch } from '../notifications/service.js'
import { broker, channels } from '../../services/realtime.js'

export interface ResolvedDevice {
  schoolId: string
  deviceId: string
}

export async function resolveDeviceByToken(plain: string): Promise<ResolvedDevice | null> {
  const tokenHash = hashToken(plain)
  const rows = await db
    .select({ schoolId: deviceTokens.schoolId, deviceId: deviceTokens.deviceId, revokedAt: deviceTokens.revokedAt })
    .from(deviceTokens)
    .where(eq(deviceTokens.tokenHash, tokenHash))
    .limit(1)
  const row = rows[0]
  if (!row || row.revokedAt) return null
  return { schoolId: row.schoolId, deviceId: row.deviceId }
}

const DEDUP_WINDOW_MS = 30_000

export interface IngestTapInput {
  tokenPlain: string
  rfidUid: string
  direction: 'in' | 'out'
  occurredAt: Date
}

export interface IngestTapResult {
  deduplicated: boolean
  record: Awaited<ReturnType<typeof recomputeAttendanceForDay>>
  notificationCount: number
}

export async function ingestTap(input: IngestTapInput): Promise<IngestTapResult> {
  const dev = await resolveDeviceByToken(input.tokenPlain)
  if (!dev) throw new UnauthorizedError('Invalid device token')

  // Look up active card by rfidUid in school.
  const cardRows = await db
    .select()
    .from(cards)
    .where(
      and(
        eq(cards.schoolId, dev.schoolId),
        eq(cards.rfidUid, input.rfidUid),
        eq(cards.status, 'active'),
        isNull(cards.deletedAt),
      ),
    )
    .limit(1)
  const card = cardRows[0]
  if (!card || !card.studentId) {
    throw new NotFoundError('Card not found or unassigned')
  }

  // Dedupe: same (rfidUid, deviceId, direction) within 30s.
  const recent = await tapEventsRepo.findRecentSameDirection({
    schoolId: dev.schoolId,
    deviceId: dev.deviceId,
    rfidUid: input.rfidUid,
    direction: input.direction,
    windowStart: new Date(input.occurredAt.getTime() - DEDUP_WINDOW_MS),
  })
  if (recent) {
    await tapEventsRepo.insert({
      schoolId: dev.schoolId,
      cardId: card.id,
      rfidUid: input.rfidUid,
      deviceId: dev.deviceId,
      studentId: card.studentId,
      direction: input.direction,
      occurredAt: input.occurredAt,
      source: 'device',
      deduplicated: true,
    })
    return { deduplicated: true, record: null, notificationCount: 0 }
  }

  await tapEventsRepo.insert({
    schoolId: dev.schoolId,
    cardId: card.id,
    rfidUid: input.rfidUid,
    deviceId: dev.deviceId,
    studentId: card.studentId,
    direction: input.direction,
    occurredAt: input.occurredAt,
    source: 'device',
  })

  // Heartbeat-ish: bump device last seen.
  await db
    .update(devices)
    .set({ lastHeartbeat: new Date(), status: 'online' })
    .where(eq(devices.id, dev.deviceId))

  const ymd = ymdInKarachi(input.occurredAt)
  const record = await recomputeAttendanceForDay(dev.schoolId, card.studentId, ymd)

  // Fan out notifications to guardians (in_app + whatsapp templates).
  const guardianRows = await db
    .select({ userId: studentGuardians.userId, phone: users.phone })
    .from(studentGuardians)
    .innerJoin(users, eq(users.id, studentGuardians.userId))
    .where(
      and(
        eq(studentGuardians.schoolId, dev.schoolId),
        eq(studentGuardians.studentId, card.studentId),
      ),
    )

  const studentRows = await db
    .select({ fullName: students.fullName })
    .from(students)
    .where(eq(students.id, card.studentId))
    .limit(1)
  const studentFullName = studentRows[0]?.fullName ?? ''

  const eventType = input.direction === 'in' ? 'tap_in' : 'tap_out'
  const title = input.direction === 'in' ? 'Arrived at school' : 'Left school'
  const body = `Tap at ${input.occurredAt.toISOString()}`
  const timeStamp = hhmmKarachi(input.occurredAt)
  let notificationCount = 0
  for (const g of guardianRows) {
    const fired = await dispatch({
      schoolId: dev.schoolId,
      recipientUserId: g.userId,
      event: eventType,
      recipientPhone: g.phone,
      payloads: {
        inApp: { title, body },
        whatsapp: {
          templateName: 'fyntra_tap_event',
          languageCode: 'en',
          variables: [studentFullName, timeStamp],
          parameterNames: ['student_name', 'time_stamp'],
        },
      },
      eventId: null,
    })
    notificationCount += fired
  }

  // Broadcast on WS.
  broker.publish(channels.school(dev.schoolId), {
    type: 'tap',
    schoolId: dev.schoolId,
    studentId: card.studentId,
    direction: input.direction,
    occurredAt: input.occurredAt.toISOString(),
  })
  broker.publish(channels.student(card.studentId), {
    type: 'tap',
    schoolId: dev.schoolId,
    studentId: card.studentId,
    direction: input.direction,
    occurredAt: input.occurredAt.toISOString(),
  })

  return { deduplicated: false, record, notificationCount }
}

export async function heartbeat(tokenPlain: string, occurredAt: Date): Promise<void> {
  const dev = await resolveDeviceByToken(tokenPlain)
  if (!dev) throw new UnauthorizedError('Invalid device token')
  await db
    .update(devices)
    .set({ lastHeartbeat: occurredAt, status: 'online' })
    .where(eq(devices.id, dev.deviceId))
}
