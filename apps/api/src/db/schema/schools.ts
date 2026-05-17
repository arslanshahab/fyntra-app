import { pgTable, uuid, text, integer, timestamp, index, date, uniqueIndex } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { users } from './auth.js'

export const schools = pgTable('schools', {
  id: uuid('id').primaryKey(),
  name: text('name').notNull(),
  address: text('address').notNull(),
  timezone: text('timezone').notNull().default('Asia/Karachi'),
  startTime: text('start_time').notNull(),
  endTime: text('end_time').notNull(),
  lateThresholdMinutes: integer('late_threshold_minutes').notNull(),
  absentThresholdMinutes: integer('absent_threshold_minutes').notNull(),
  // Attendance-policy knobs added in PR 2. workingDays is stored as a
  // text[] of 3-letter day codes (mon, tue, ...). halfDayCutoffTime is
  // "HH:MM" Karachi local; null = feature off (a kid leaving early on a
  // normal day stays `left_early`, not `half_day`). academicYear* dates
  // bound the per-student summary's "year-to-date" math; null falls back
  // to calendar year.
  workingDays: text('working_days').array().notNull().default(['mon', 'tue', 'wed', 'thu', 'fri']),
  halfDayCutoffTime: text('half_day_cutoff_time'),
  academicYearStart: date('academic_year_start'),
  academicYearEnd: date('academic_year_end'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const classes = pgTable(
  'classes',
  {
    id: uuid('id').primaryKey(),
    schoolId: uuid('school_id').notNull().references(() => schools.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    teacherId: uuid('teacher_id').references(() => users.id, { onDelete: 'restrict' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    bySchool: index('classes_school_idx').on(t.schoolId, t.id),
    byTeacherUnique: uniqueIndex('classes_school_teacher_unique')
      .on(t.schoolId, t.teacherId)
      .where(sql`${t.teacherId} IS NOT NULL`),
  }),
)

export type SchoolRow = typeof schools.$inferSelect
export type ClassRow = typeof classes.$inferSelect
