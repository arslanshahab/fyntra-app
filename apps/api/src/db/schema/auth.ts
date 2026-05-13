import { pgTable, uuid, text, timestamp, integer, index, pgEnum } from 'drizzle-orm/pg-core'
import { schools } from './schools.js'

export const roleEnum = pgEnum('user_role', ['parent', 'admin', 'teacher'])
export const localeEnum = pgEnum('locale', ['en', 'ur'])

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey(),
    schoolId: uuid('school_id').notNull().references(() => schools.id, { onDelete: 'cascade' }),
    role: roleEnum('role').notNull(),
    fullName: text('full_name').notNull(),
    phone: text('phone').notNull().unique(),
    email: text('email'),
    preferredLanguage: localeEnum('preferred_language').notNull().default('en'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    bySchool: index('users_school_idx').on(t.schoolId, t.id),
    byPhone: index('users_phone_idx').on(t.phone),
  }),
)

export const otpCodes = pgTable(
  'otp_codes',
  {
    id: uuid('id').primaryKey(),
    phone: text('phone').notNull(),
    codeHash: text('code_hash').notNull(),
    salt: text('salt').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    attempts: integer('attempts').notNull().default(0),
    consumedAt: timestamp('consumed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byPhone: index('otp_phone_idx').on(t.phone, t.expiresAt),
  }),
)

export type UserRow = typeof users.$inferSelect
export type OtpRow = typeof otpCodes.$inferSelect
