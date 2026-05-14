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
