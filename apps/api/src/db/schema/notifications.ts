import { pgTable, uuid, timestamp, boolean, index, pgEnum, jsonb } from 'drizzle-orm/pg-core'
import { schools } from './schools.js'
import { users } from './auth.js'
import { tapEvents } from './attendance.js'

export const notificationChannelEnum = pgEnum('notification_channel', ['whatsapp', 'sms', 'in_app'])
export const notificationStatusEnum = pgEnum('notification_status', [
  'queued',
  'sent',
  'delivered',
  'failed',
])

export const notificationLogs = pgTable(
  'notification_logs',
  {
    id: uuid('id').primaryKey(),
    schoolId: uuid('school_id').notNull().references(() => schools.id, { onDelete: 'cascade' }),
    recipientUserId: uuid('recipient_user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    channel: notificationChannelEnum('channel').notNull(),
    eventId: uuid('event_id').references(() => tapEvents.id, { onDelete: 'set null' }),
    status: notificationStatusEnum('status').notNull(),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    payload: jsonb('payload').$type<{
      title: string
      body: string
      errorMessage?: string
      templateName?: string
      variables?: string[]
      parameterNames?: string[]
      languageCode?: string
      dryRun?: boolean
    }>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byRecipient: index('notif_recipient_idx').on(t.schoolId, t.recipientUserId, t.createdAt),
  }),
)

export const notificationSettings = pgTable(
  'notification_settings',
  {
    userId: uuid('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
    schoolId: uuid('school_id').notNull().references(() => schools.id, { onDelete: 'cascade' }),
    whatsapp: boolean('whatsapp').notNull(),
    sms: boolean('sms').notNull(),
    inApp: boolean('in_app').notNull(),
    eventTapIn: boolean('event_tap_in').notNull(),
    eventTapOut: boolean('event_tap_out').notNull(),
    eventLate: boolean('event_late').notNull(),
    eventAbsent: boolean('event_absent').notNull(),
    eventManualOverride: boolean('event_manual_override').notNull(),
    eventDeviceOffline: boolean('event_device_offline').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    bySchool: index('notif_settings_school_idx').on(t.schoolId, t.userId),
  }),
)
