import { pgTable, uuid, text, timestamp, boolean, index, pgEnum, date, unique } from 'drizzle-orm/pg-core'
import { schools } from './schools.js'
import { students } from './students.js'
import { cards } from './cards.js'
import { devices } from './devices.js'
import { users } from './auth.js'

export const tapDirectionEnum = pgEnum('tap_direction', ['in', 'out'])
export const tapSourceEnum = pgEnum('tap_source', ['device', 'manual'])
export const attendanceStatusEnum = pgEnum('attendance_status', [
  'present',
  'absent',
  'late',
  'left_early',
  'unverified',
])

export const tapEvents = pgTable(
  'tap_events',
  {
    id: uuid('id').primaryKey(),
    schoolId: uuid('school_id').notNull().references(() => schools.id, { onDelete: 'cascade' }),
    cardId: uuid('card_id').references(() => cards.id, { onDelete: 'set null' }),
    rfidUid: text('rfid_uid').notNull(),
    deviceId: uuid('device_id').references(() => devices.id, { onDelete: 'restrict' }),
    studentId: uuid('student_id').references(() => students.id, { onDelete: 'set null' }),
    direction: tapDirectionEnum('direction').notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
    source: tapSourceEnum('source').notNull(),
    manualOverrideBy: uuid('manual_override_by').references(() => users.id, { onDelete: 'set null' }),
    manualReason: text('manual_reason'),
    deduplicated: boolean('deduplicated').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    bySchool: index('taps_school_idx').on(t.schoolId, t.occurredAt),
    byStudent: index('taps_student_idx').on(t.schoolId, t.studentId, t.occurredAt),
    byDevice: index('taps_device_idx').on(t.schoolId, t.deviceId, t.occurredAt),
  }),
)

export const attendanceRecords = pgTable(
  'attendance_records',
  {
    id: uuid('id').primaryKey(),
    schoolId: uuid('school_id').notNull().references(() => schools.id, { onDelete: 'cascade' }),
    studentId: uuid('student_id').notNull().references(() => students.id, { onDelete: 'cascade' }),
    date: date('date').notNull(),
    firstInAt: timestamp('first_in_at', { withTimezone: true }),
    lastOutAt: timestamp('last_out_at', { withTimezone: true }),
    status: attendanceStatusEnum('status').notNull(),
    isManual: boolean('is_manual').notNull().default(false),
    leftWithoutScan: boolean('left_without_scan').notNull().default(false),
    flaggedForReview: boolean('flagged_for_review').notNull().default(false),
    cardAnomaly: boolean('card_anomaly').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byStudentDate: unique('ar_student_date_uniq').on(t.studentId, t.date),
    bySchool: index('ar_school_idx').on(t.schoolId, t.date),
  }),
)
