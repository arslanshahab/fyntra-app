import type { FastifyBaseLogger } from 'fastify'
import type { NotificationSettings } from '@fyntra/schemas'
import { eq } from 'drizzle-orm'
import { db } from '../../db/client.js'
import { users } from '../../db/schema/auth.js'
import { NotFoundError } from '../../lib/errors.js'
import { sendTemplate } from '../../services/whatsapp.js'
import type { TenantContext } from '../../types/tenant-context.js'
import { notificationsRepo } from './repository.js'

export type NotificationEvent =
  | 'tap_in'
  | 'tap_out'
  | 'late'
  | 'absent'
  | 'manual_override'
  | 'device_offline'

export interface DispatchInput {
  schoolId: string
  recipientUserId: string
  event: NotificationEvent
  payloads: {
    inApp?: { title: string; body: string }
    whatsapp?: { templateName: string; variables: string[] }
    sms?: { body: string }
  }
  eventId?: string | null
  recipientPhone: string
}

type SettingsRow = NonNullable<Awaited<ReturnType<typeof notificationsRepo.findSettings>>>
type SettingsKey = keyof SettingsRow & string

const SETTINGS_EVENT_FIELD: Record<NotificationEvent, SettingsKey> = {
  tap_in: 'eventTapIn',
  tap_out: 'eventTapOut',
  late: 'eventLate',
  absent: 'eventAbsent',
  manual_override: 'eventManualOverride',
  device_offline: 'eventDeviceOffline',
}

type NotificationStatus = 'queued' | 'sent' | 'delivered' | 'failed'

type LogRow = Awaited<ReturnType<typeof notificationsRepo.listLogs>>[number]

interface WireLog {
  id: string
  recipientUserId: string
  channel: 'whatsapp' | 'sms' | 'in_app'
  eventId?: string
  status: NotificationStatus
  sentAt?: string
  payload: { title: string; body: string }
}

function logToWire(row: LogRow): WireLog {
  const wire: WireLog = {
    id: row.id,
    recipientUserId: row.recipientUserId,
    channel: row.channel,
    status: row.status,
    payload: { title: row.payload.title, body: row.payload.body },
  }
  if (row.eventId) wire.eventId = row.eventId
  if (row.sentAt) wire.sentAt = row.sentAt.toISOString()
  return wire
}

function settingsToWire(row: SettingsRow): NotificationSettings {
  return {
    channels: {
      whatsapp: row.whatsapp,
      sms: row.sms,
      in_app: row.inApp,
    },
    events: {
      tap_in: row.eventTapIn,
      tap_out: row.eventTapOut,
      late: row.eventLate,
      absent: row.eventAbsent,
      manual_override: row.eventManualOverride,
      device_offline: row.eventDeviceOffline,
    },
  }
}

function wireToDbPatch(input: NotificationSettings) {
  return {
    whatsapp: input.channels.whatsapp,
    sms: input.channels.sms,
    inApp: input.channels.in_app,
    eventTapIn: input.events.tap_in,
    eventTapOut: input.events.tap_out,
    eventLate: input.events.late,
    eventAbsent: input.events.absent,
    eventManualOverride: input.events.manual_override,
    eventDeviceOffline: input.events.device_offline,
  }
}

// Fan out a notification across the recipient's enabled channels. Returns the
// number of channels that actually fired (i.e. the count of notification_logs
// rows written — both successful and failed sends count, because the row exists
// either way; only opted-out channels skip the insert).
//
// Semantics:
// - No settings row for the recipient → 0 (the user hasn't auto-created their
//   defaults yet via /me; we don't fan-out blindly).
// - Event flag disabled in settings → 0.
// - For each payload key present whose channel flag is true, attempt a send.
export async function dispatch(input: DispatchInput): Promise<number> {
  const settings = await notificationsRepo.findSettings(input.recipientUserId)
  if (!settings) return 0
  const field = SETTINGS_EVENT_FIELD[input.event]
  if (!settings[field]) return 0

  let count = 0

  // in_app
  if (input.payloads.inApp && settings.inApp) {
    await notificationsRepo.insertLog({
      schoolId: input.schoolId,
      recipientUserId: input.recipientUserId,
      channel: 'in_app',
      eventId: input.eventId ?? null,
      status: 'sent',
      payload: { title: input.payloads.inApp.title, body: input.payloads.inApp.body },
      sentAt: new Date(),
    })
    count++
  }

  // whatsapp
  if (input.payloads.whatsapp && settings.whatsapp) {
    if (!input.recipientPhone) {
      console.warn(
        `[notifications.dispatch] whatsapp skipped for user=${input.recipientUserId} event=${input.event}: no recipient phone`,
      )
    } else {
      const result = await sendTemplate({
        to: input.recipientPhone,
        name: input.payloads.whatsapp.templateName,
        languageCode: 'en_US',
        variables: input.payloads.whatsapp.variables,
      })
      const title = input.payloads.inApp?.title ?? `<${input.payloads.whatsapp.templateName}>`
      const body = input.payloads.inApp?.body ?? `<${input.payloads.whatsapp.templateName}>`
      const payload: {
        title: string
        body: string
        errorMessage?: string
        templateName: string
        variables: string[]
        dryRun?: boolean
      } = {
        title,
        body,
        templateName: input.payloads.whatsapp.templateName,
        variables: input.payloads.whatsapp.variables,
      }
      if (result.errorMessage) payload.errorMessage = result.errorMessage
      if (result.dryRun) payload.dryRun = true
      await notificationsRepo.insertLog({
        schoolId: input.schoolId,
        recipientUserId: input.recipientUserId,
        channel: 'whatsapp',
        eventId: input.eventId ?? null,
        status: result.status,
        payload,
        sentAt: result.status === 'sent' ? new Date() : null,
      })
      count++
    }
  }

  // sms — no provider wired; always logged as failed.
  if (input.payloads.sms && settings.sms) {
    await notificationsRepo.insertLog({
      schoolId: input.schoolId,
      recipientUserId: input.recipientUserId,
      channel: 'sms',
      eventId: input.eventId ?? null,
      status: 'failed',
      payload: {
        title: '',
        body: input.payloads.sms.body,
        errorMessage: 'sms provider not configured',
      },
      sentAt: null,
    })
    count++
  }

  return count
}

export async function getMySettings(ctx: TenantContext): Promise<NotificationSettings> {
  const existing = await notificationsRepo.findSettings(ctx.userId)
  if (existing) return settingsToWire(existing)
  const created = await notificationsRepo.insertSettingsDefaults({
    userId: ctx.userId,
    schoolId: ctx.schoolId,
    role: ctx.role,
  })
  return settingsToWire(created)
}

export async function updateMySettings(
  ctx: TenantContext,
  patch: NotificationSettings,
  requestLog: FastifyBaseLogger,
): Promise<NotificationSettings> {
  let effective: NotificationSettings = patch
  if (ctx.role === 'parent' && patch.events.device_offline === true) {
    requestLog.warn({ userId: ctx.userId }, 'parent device_offline=true coerced to false')
    effective = {
      ...patch,
      events: { ...patch.events, device_offline: false },
    }
  }

  const existing = await notificationsRepo.findSettings(ctx.userId)
  if (!existing) {
    // Race: settings row hasn't been auto-created yet. Seed defaults first
    // so the row exists, then overwrite with the wire patch.
    await notificationsRepo.insertSettingsDefaults({
      userId: ctx.userId,
      schoolId: ctx.schoolId,
      role: ctx.role,
    })
  }

  const updated = await notificationsRepo.updateSettings(ctx.userId, wireToDbPatch(effective))
  return settingsToWire(updated)
}

export interface ListNotificationsFilters {
  userId?: string
  status?: NotificationStatus
}

export async function listNotifications(
  ctx: TenantContext,
  filters: ListNotificationsFilters,
): Promise<WireLog[]> {
  const effective: ListNotificationsFilters =
    ctx.role === 'parent'
      ? { userId: ctx.userId, status: filters.status }
      : { userId: filters.userId, status: filters.status }
  const rows = await notificationsRepo.listLogs(ctx, effective)
  return rows.map(logToWire)
}

export async function retryNotification(ctx: TenantContext, id: string): Promise<WireLog> {
  const existing = await notificationsRepo.findLog(ctx, id)
  if (!existing) throw new NotFoundError('Notification not found')

  if (existing.channel === 'in_app') {
    const updated = await notificationsRepo.markLogResent(ctx, id)
    if (!updated) throw new NotFoundError('Notification not found')
    return logToWire(updated)
  }

  if (existing.channel === 'whatsapp') {
    const tpl = existing.payload.templateName
    const vars = existing.payload.variables
    if (!tpl || !vars) {
      const updated = await notificationsRepo.markLogResult(
        ctx,
        id,
        'failed',
        'cannot retry — original template payload missing',
      )
      if (!updated) throw new NotFoundError('Notification not found')
      return logToWire(updated)
    }
    const userRows = await db
      .select({ phone: users.phone })
      .from(users)
      .where(eq(users.id, existing.recipientUserId))
      .limit(1)
    const phone = userRows[0]?.phone
    if (!phone) {
      const updated = await notificationsRepo.markLogResult(ctx, id, 'failed', 'recipient phone not found')
      if (!updated) throw new NotFoundError('Notification not found')
      return logToWire(updated)
    }
    const result = await sendTemplate({
      to: phone,
      name: tpl,
      languageCode: 'en',
      variables: vars,
    })
    const updated = await notificationsRepo.markLogResult(ctx, id, result.status, result.errorMessage)
    if (!updated) throw new NotFoundError('Notification not found')
    return logToWire(updated)
  }

  // sms: no provider — keep returning a failed status.
  const updated = await notificationsRepo.markLogResult(ctx, id, 'failed', 'sms provider not configured')
  if (!updated) throw new NotFoundError('Notification not found')
  return logToWire(updated)
}
