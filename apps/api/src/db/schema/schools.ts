import { pgTable, uuid, text, integer, timestamp, index } from 'drizzle-orm/pg-core'

export const schools = pgTable('schools', {
  id: uuid('id').primaryKey(),
  name: text('name').notNull(),
  address: text('address').notNull(),
  timezone: text('timezone').notNull().default('Asia/Karachi'),
  startTime: text('start_time').notNull(),
  endTime: text('end_time').notNull(),
  lateThresholdMinutes: integer('late_threshold_minutes').notNull(),
  absentThresholdMinutes: integer('absent_threshold_minutes').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const classes = pgTable(
  'classes',
  {
    id: uuid('id').primaryKey(),
    schoolId: uuid('school_id').notNull().references(() => schools.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    teacherId: uuid('teacher_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    bySchool: index('classes_school_idx').on(t.schoolId, t.id),
  }),
)

export type SchoolRow = typeof schools.$inferSelect
export type ClassRow = typeof classes.$inferSelect
