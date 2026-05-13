import { pgTable, uuid, text, timestamp, index, pgEnum, primaryKey } from 'drizzle-orm/pg-core'
import { schools, classes } from './schools.js'
import { users } from './auth.js'

export const studentStatusEnum = pgEnum('student_status', ['active', 'inactive'])
export const guardianRelationshipEnum = pgEnum('guardian_relationship', [
  'father',
  'mother',
  'guardian',
  'driver',
  'other',
])

export const students = pgTable(
  'students',
  {
    id: uuid('id').primaryKey(),
    schoolId: uuid('school_id').notNull().references(() => schools.id, { onDelete: 'cascade' }),
    classId: uuid('class_id').notNull().references(() => classes.id, { onDelete: 'restrict' }),
    fullName: text('full_name').notNull(),
    rollNumber: text('roll_number').notNull(),
    photoUrl: text('photo_url'),
    status: studentStatusEnum('status').notNull().default('active'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    bySchool: index('students_school_idx').on(t.schoolId, t.id),
    byClass: index('students_class_idx').on(t.schoolId, t.classId),
  }),
)

export const studentGuardians = pgTable(
  'student_guardians',
  {
    studentId: uuid('student_id').notNull().references(() => students.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    schoolId: uuid('school_id').notNull().references(() => schools.id, { onDelete: 'cascade' }),
    relationship: guardianRelationshipEnum('relationship'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.studentId, t.userId] }),
    bySchool: index('sg_school_idx').on(t.schoolId, t.studentId),
    byUser: index('sg_user_idx').on(t.schoolId, t.userId),
  }),
)

export type StudentRow = typeof students.$inferSelect
