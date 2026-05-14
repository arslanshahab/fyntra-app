import { and, eq } from 'drizzle-orm'
import { db } from '../../db/client.js'
import { users } from '../../db/schema/auth.js'
import { students, studentGuardians } from '../../db/schema/students.js'
import type { TenantContext } from '../../types/tenant-context.js'
import { NotFoundError } from '../../lib/errors.js'
import { ymdInKarachi } from '../../lib/time.js'
import { tapEventsRepo } from './repository.js'
import { recomputeAttendanceForDay } from '../attendance/service.js'
import { dispatch } from '../notifications/service.js'
import { broker, channels } from '../../services/realtime.js'

export interface ListTapEventsFilters {
  from?: string
  to?: string
  studentId?: string
}

export async function listTapEvents(ctx: TenantContext, filters: ListTapEventsFilters) {
  const rows = await tapEventsRepo.listForRange({
    schoolId: ctx.schoolId,
    from: filters.from ? new Date(filters.from) : undefined,
    to: filters.to ? new Date(filters.to) : undefined,
    studentId: filters.studentId,
  })
  return rows.map((r) => ({
    id: r.id,
    cardId: r.cardId ?? '',
    rfidUid: r.rfidUid,
    deviceId: r.deviceId ?? '',
    direction: r.direction,
    occurredAt: r.occurredAt.toISOString(),
    source: r.source,
    manualOverrideBy: r.manualOverrideBy ?? undefined,
    manualReason: r.manualReason ?? undefined,
  }))
}

export interface ManualOverrideInput {
  studentId: string
  direction: 'in' | 'out'
  occurredAt: string
  reason: string
}

export async function recordManualOverride(ctx: TenantContext, input: ManualOverrideInput) {
  // Verify student exists in caller's school
  const studentRows = await db
    .select()
    .from(students)
    .where(and(eq(students.schoolId, ctx.schoolId), eq(students.id, input.studentId)))
    .limit(1)
  const student = studentRows[0]
  if (!student) throw new NotFoundError('Student not found')

  const occurredAt = new Date(input.occurredAt)

  // Insert the manual tap event
  await tapEventsRepo.insert({
    schoolId: ctx.schoolId,
    cardId: null,
    rfidUid: '',
    deviceId: null,
    studentId: input.studentId,
    direction: input.direction,
    occurredAt,
    source: 'manual',
    manualOverrideBy: ctx.userId,
    manualReason: input.reason,
  })

  // Recompute attendance for the affected day
  const ymd = ymdInKarachi(occurredAt)
  const record = await recomputeAttendanceForDay(ctx.schoolId, input.studentId, ymd)

  // Fan out manual_override notification to the student's guardians.
  // Note: only in_app — no `fyntra_manual_override` (or `fyntra_device_offline`)
  // WhatsApp template is approved in Meta, so we deliberately skip the WA leg
  // for these two events until/unless those templates ship.
  const guardianRows = await db
    .select({ userId: studentGuardians.userId, phone: users.phone })
    .from(studentGuardians)
    .innerJoin(users, eq(users.id, studentGuardians.userId))
    .where(
      and(
        eq(studentGuardians.schoolId, ctx.schoolId),
        eq(studentGuardians.studentId, input.studentId),
      ),
    )
  for (const g of guardianRows) {
    await dispatch({
      schoolId: ctx.schoolId,
      recipientUserId: g.userId,
      event: 'manual_override',
      recipientPhone: g.phone,
      payloads: {
        inApp: {
          title: 'Manual attendance update',
          body: `${student.fullName}: ${input.direction === 'in' ? 'arrival' : 'departure'} recorded by admin. Reason: ${input.reason}`,
        },
      },
    })
  }

  // Broadcast on WS (school + student channels)
  broker.publish(channels.school(ctx.schoolId), {
    type: 'manual_override',
    schoolId: ctx.schoolId,
    studentId: input.studentId,
    direction: input.direction,
    occurredAt: occurredAt.toISOString(),
    reason: input.reason,
    by: ctx.userId,
  })
  broker.publish(channels.student(input.studentId), {
    type: 'manual_override',
    schoolId: ctx.schoolId,
    studentId: input.studentId,
    direction: input.direction,
    occurredAt: occurredAt.toISOString(),
    reason: input.reason,
    by: ctx.userId,
  })

  return {
    deduplicated: false,
    recordStatus: record?.status ?? null,
  }
}
