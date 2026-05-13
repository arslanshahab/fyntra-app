import { pgTable, uuid, text, timestamp, index, pgEnum } from 'drizzle-orm/pg-core'
import { schools } from './schools.js'

export const deviceDirectionEnum = pgEnum('device_direction', ['in', 'out', 'both'])
export const deviceStatusEnum = pgEnum('device_status', ['online', 'offline'])

export const devices = pgTable(
  'devices',
  {
    id: uuid('id').primaryKey(),
    schoolId: uuid('school_id').notNull().references(() => schools.id, { onDelete: 'cascade' }),
    label: text('label').notNull(),
    direction: deviceDirectionEnum('direction').notNull(),
    status: deviceStatusEnum('status').notNull().default('offline'),
    lastHeartbeat: timestamp('last_heartbeat', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    bySchool: index('devices_school_idx').on(t.schoolId, t.id),
  }),
)

export const deviceTokens = pgTable(
  'device_tokens',
  {
    id: uuid('id').primaryKey(),
    deviceId: uuid('device_id').notNull().references(() => devices.id, { onDelete: 'cascade' }),
    schoolId: uuid('school_id').notNull().references(() => schools.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull(),
    label: text('label').notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byHash: index('device_tokens_hash_idx').on(t.tokenHash),
    byDevice: index('device_tokens_device_idx').on(t.schoolId, t.deviceId),
  }),
)
