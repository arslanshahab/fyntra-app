import { pgTable, uuid, text, timestamp, date, index, unique, pgEnum } from 'drizzle-orm/pg-core'
import { schools } from './schools.js'
import { users } from './auth.js'

export const holidayKindEnum = pgEnum('holiday_kind', ['closed', 'exam', 'half_day'])

// Dated exceptions to the regular school calendar.
//
//   - 'closed'   — school is shut (gazetted holiday, weather day). The absent
//                  cron short-circuits; no parent alerts; the monthly
//                  register cell renders H.
//   - 'exam'     — attendance is not recorded for the day (exam-only
//                  schedule). Same cron + alert behaviour as 'closed'; the
//                  register cell renders E.
//   - 'half_day' — the school day ends earlier than the school's normal
//                  endTime. `effective_end_time` carries the early end
//                  (HH:MM, Karachi). The absent cron still runs (kids who
//                  don't show are still absent), but recompute uses the
//                  shortened endTime so leaving at the early-end time stays
//                  `present`, not `left_early`. The register cell renders HD.
//
// effective_end_time is enforced as non-null when kind = 'half_day' in the
// service layer (Postgres CHECK constraints are awkward against pgEnum;
// validation lives in Zod at the wire edge).
export const schoolHolidays = pgTable(
  'school_holidays',
  {
    id: uuid('id').primaryKey(),
    schoolId: uuid('school_id').notNull().references(() => schools.id, { onDelete: 'cascade' }),
    date: date('date').notNull(),
    label: text('label').notNull(),
    kind: holidayKindEnum('kind').notNull(),
    effectiveEndTime: text('effective_end_time'), // "HH:MM" Karachi; required when kind = 'half_day'
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    bySchoolDate: index('school_holidays_school_date_idx').on(t.schoolId, t.date),
    schoolDateUniq: unique('school_holidays_school_date_uniq').on(t.schoolId, t.date),
  }),
)

export type SchoolHolidayRow = typeof schoolHolidays.$inferSelect
export type HolidayKind = SchoolHolidayRow['kind']
