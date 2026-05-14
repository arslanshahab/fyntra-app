import type { FastifyBaseLogger } from 'fastify'
import type { NotificationSettings } from '@fyntra/schemas'
import { NotFoundError } from '../../lib/errors.js'
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
  title: string
  body: string
  eventId?: string | null
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

// Inserts a notification_logs row if the recipient has in-app enabled for this
// event. Returns true on insert, false if the recipient's settings opt out (or
// no settings row exists).
//
// Plan B will add whatsapp/sms branches and replace the in_app-only fan-out at
// every caller.
export async function dispatchInAppNotification(input: DispatchInput): Promise<boolean> {
  const settings = await notificationsRepo.findSettings(input.recipientUserId)
  if (!settings) return false
  if (!settings.inApp) return false
  const field = SETTINGS_EVENT_FIELD[input.event]
  if (!settings[field]) return false
  await notificationsRepo.insertLog({
    schoolId: input.schoolId,
    recipientUserId: input.recipientUserId,
    channel: 'in_app',
    eventId: input.eventId ?? null,
    status: 'sent',
    payload: { title: input.title, body: input.body },
    sentAt: new Date(),
  })
  return true
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
  // TODO(slice 8): re-invoke channel provider (whatsapp sendTemplate, etc)
  const updated = await notificationsRepo.markLogResent(ctx, id)
  if (!updated) throw new NotFoundError('Notification not found')
  return logToWire(updated)
}
