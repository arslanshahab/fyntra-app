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
  // Student-level "half day" status, emitted by recompute when tap-out
  // lands before School.halfDayCutoffTime on a regular school day.
  // Distinct from `left_early` (which still applies when no cutoff is set
  // or the tap-out lands between cutoff and endTime).
  'half_day',
])

// Structured reason for a manual tap override. The freeform `manual_reason`
// column stays for nuance ("kid was at the nurse"), but this enum is what
// the monthly register reads to produce register codes (P/L/A/HD/E).
// Nullable because existing rows pre-date this column.
export const tapEventReasonKindEnum = pgEnum('tap_event_reason_kind', [
  'forgot_card',
  'out_of_band_tap',
  'sick',
  'leave',
  'half_day',
  'early_pickup',
  'late_arrival',
  'in_school_not_in_class',
  'other',
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
    manualReasonKind: tapEventReasonKindEnum('manual_reason_kind'),
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
    // Register sign-off (F4): once a class teacher locks the day, recompute
    // short-circuits and non-admin manual overrides are rejected.
    lockedAt: timestamp('locked_at', { withTimezone: true }),
    lockedBy: uuid('locked_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byStudentDate: unique('ar_student_date_uniq').on(t.studentId, t.date),
    bySchool: index('ar_school_idx').on(t.schoolId, t.date),
  }),
)
