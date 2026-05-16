import { pgTable, uuid, text, timestamp, index, pgEnum } from 'drizzle-orm/pg-core'
import { schools } from './schools.js'
import { students } from './students.js'
import { users } from './auth.js'

export const cardStatusEnum = pgEnum('card_status', ['active', 'lost', 'replaced', 'deactivated'])

export const cards = pgTable(
  'cards',
  {
    id: uuid('id').primaryKey(),
    schoolId: uuid('school_id').notNull().references(() => schools.id, { onDelete: 'cascade' }),
    rfidUid: text('rfid_uid').notNull(),
    studentId: uuid('student_id').references(() => students.id, { onDelete: 'set null' }),
    status: cardStatusEnum('status').notNull().default('active'),
    issuedAt: timestamp('issued_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    bySchool: index('cards_school_idx').on(t.schoolId, t.id),
    byUidActive: index('cards_uid_active_idx').on(t.schoolId, t.rfidUid, t.status),
  }),
)

export const cardAuditActionEnum = pgEnum('card_audit_action', [
  'issued',
  'assigned',
  'replaced',
  'lost',
  'deactivated',
  'reactivated',
])

export const cardAuditEntries = pgTable(
  'card_audit_entries',
  {
    id: uuid('id').primaryKey(),
    schoolId: uuid('school_id').notNull().references(() => schools.id, { onDelete: 'cascade' }),
    cardId: uuid('card_id').notNull().references(() => cards.id, { onDelete: 'cascade' }),
    byUserId: uuid('by_user_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
    action: cardAuditActionEnum('action').notNull(),
    note: text('note'),
    at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byCard: index('card_audit_card_idx').on(t.schoolId, t.cardId, t.at),
  }),
)
