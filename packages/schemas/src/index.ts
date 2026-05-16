import { z } from 'zod'

// Single source of truth for the Phase 1 data shapes from README §5.
// Every API response is validated against the relevant response schema
// before it enters React Query state — see services/api/client.ts (step 5).

export const idSchema = z.string().min(1)
export const roleSchema = z.enum(['parent', 'admin', 'teacher'])
export type Role = z.infer<typeof roleSchema>
export const localeSchema = z.enum(['en', 'ur'])

export const userSchema = z.object({
  id: idSchema,
  role: roleSchema,
  fullName: z.string(),
  phone: z.string(),
  email: z.string().email().optional(),
  preferredLanguage: localeSchema,
  schoolId: idSchema,
})
export type User = z.infer<typeof userSchema>

export const schoolSchema = z.object({
  id: idSchema,
  name: z.string(),
  address: z.string(),
  timezone: z.literal('Asia/Karachi'),
  startTime: z.string(),
  endTime: z.string(),
  lateThresholdMinutes: z.number().int().nonnegative(),
  absentThresholdMinutes: z.number().int().nonnegative(),
})
export type School = z.infer<typeof schoolSchema>

export const studentStatusSchema = z.enum(['active', 'inactive'])
export const studentSchema = z.object({
  id: idSchema,
  fullName: z.string(),
  rollNumber: z.string(),
  classId: idSchema,
  schoolId: idSchema,
  guardianIds: z.array(idSchema),
  cardId: idSchema.optional(),
  photoUrl: z.string().url().optional(),
  status: studentStatusSchema,
})
export type Student = z.infer<typeof studentSchema>

// GET /students/:id returns the student with embedded guardians so the
// admin detail page doesn't need a per-guardian /users/:id round trip.
export const studentDetailSchema = studentSchema.extend({
  guardians: z.array(userSchema),
})
export type StudentDetail = z.infer<typeof studentDetailSchema>

export const classSchema = z.object({
  id: idSchema,
  name: z.string(),
  teacherId: idSchema,
  schoolId: idSchema,
})
export type Class = z.infer<typeof classSchema>

export const cardStatusSchema = z.enum(['active', 'lost', 'replaced', 'deactivated'])
export type CardStatus = z.infer<typeof cardStatusSchema>

// Audit trail entry per README §7.5 ("Always show audit trail"). Each
// mutation on a card appends one entry; the seed builder seeds an
// initial "issued" entry so the history starts non-empty.
export const cardAuditActionSchema = z.enum([
  'issued',
  'assigned',
  'replaced',
  'lost',
  'deactivated',
  'reactivated',
])
export const cardAuditEntrySchema = z.object({
  at: z.string(),
  byUserId: idSchema,
  action: cardAuditActionSchema,
  note: z.string().optional(),
})
export type CardAuditEntry = z.infer<typeof cardAuditEntrySchema>

export const cardSchema = z.object({
  id: idSchema,
  rfidUid: z.string(),
  studentId: idSchema.optional(),
  status: cardStatusSchema,
  issuedAt: z.string(),
  auditLog: z.array(cardAuditEntrySchema).default([]),
})
export type Card = z.infer<typeof cardSchema>

export const deviceDirectionSchema = z.enum(['in', 'out', 'both'])
export const deviceStatusSchema = z.enum(['online', 'offline'])
export const deviceSchema = z.object({
  id: idSchema,
  schoolId: idSchema,
  label: z.string(),
  direction: deviceDirectionSchema,
  status: deviceStatusSchema,
  lastHeartbeat: z.string(),
})
export type Device = z.infer<typeof deviceSchema>

export const tapDirectionSchema = z.enum(['in', 'out'])
export type TapDirection = z.infer<typeof tapDirectionSchema>
export const tapSourceSchema = z.enum(['device', 'manual'])
export const tapEventSchema = z.object({
  id: idSchema,
  // cardId / deviceId are absent on manual overrides (source: 'manual').
  cardId: idSchema.optional(),
  rfidUid: z.string(),
  deviceId: idSchema.optional(),
  studentId: idSchema.optional(),
  direction: tapDirectionSchema,
  occurredAt: z.string(),
  source: tapSourceSchema,
  manualOverrideBy: idSchema.optional(),
  manualReason: z.string().optional(),
})
export type TapEvent = z.infer<typeof tapEventSchema>

export const attendanceStatusSchema = z.enum(['present', 'absent', 'late', 'left_early', 'unverified'])
export const attendanceRecordSchema = z.object({
  id: idSchema,
  studentId: idSchema,
  date: z.string(), // "YYYY-MM-DD"
  firstInAt: z.string().optional(),
  lastOutAt: z.string().optional(),
  status: attendanceStatusSchema,
  isManual: z.boolean(),
})
export type AttendanceRecord = z.infer<typeof attendanceRecordSchema>

export const notificationChannelSchema = z.enum(['whatsapp', 'sms', 'in_app'])
export const notificationStatusSchema = z.enum(['queued', 'sent', 'delivered', 'failed'])
export const notificationLogSchema = z.object({
  id: idSchema,
  recipientUserId: idSchema,
  channel: notificationChannelSchema,
  eventId: idSchema,
  status: notificationStatusSchema,
  sentAt: z.string().optional(),
  payload: z.object({
    title: z.string(),
    body: z.string(),
  }),
})
export type NotificationLog = z.infer<typeof notificationLogSchema>

// PATCH /notifications/settings body — see README §6.
// device_offline is admin/teacher only; the parent settings UI does not
// expose it. UI language stays on User.preferredLanguage, NOT here.
export const notificationSettingsSchema = z.object({
  channels: z.object({
    whatsapp: z.boolean(),
    sms: z.boolean(),
    in_app: z.boolean(),
  }),
  events: z.object({
    tap_in: z.boolean(),
    tap_out: z.boolean(),
    late: z.boolean(),
    absent: z.boolean(),
    manual_override: z.boolean(),
    device_offline: z.boolean(),
  }),
})
export type NotificationSettings = z.infer<typeof notificationSettingsSchema>

// --- Request schemas (POST/PATCH bodies) ---

export const requestOtpRequestSchema = z.object({ phone: z.string() })
export const verifyOtpRequestSchema = z.object({
  phone: z.string(),
  otp: z.string().regex(/^\d{4}$/),
})
export const assignCardRequestSchema = z.object({ cardId: idSchema, studentId: idSchema })
export const replaceCardRequestSchema = z.object({
  studentId: idSchema,
  newRfidUid: z.string(),
})
export const patchCardRequestSchema = z.object({ status: cardStatusSchema })
export const manualTapEventRequestSchema = z.object({
  studentId: idSchema,
  direction: tapDirectionSchema,
  occurredAt: z.string(),
  reason: z.string().min(1),
})
export const simulateTapRequestSchema = z.object({
  rfidUid: z.string(),
  deviceId: idSchema,
  direction: tapDirectionSchema,
})

// --- Response schemas (the wrapper shapes) ---

export const verifyOtpResponseSchema = z.object({
  token: z.string(),
  user: userSchema,
})
export type VerifyOtpResponse = z.infer<typeof verifyOtpResponseSchema>

// /me — README §6: school is always present (parents need start/end times
// and thresholds to render the hero status). `children` is present iff
// user.role === "parent". `assignedClass` is present iff user.role ===
// "teacher" — the class they're responsible for in the today roster.
export const meResponseSchema = z.object({
  user: userSchema,
  school: schoolSchema,
  children: z.array(studentSchema).optional(),
  assignedClass: classSchema.optional(),
})
export type MeResponse = z.infer<typeof meResponseSchema>

export const okResponseSchema = z.object({ ok: z.literal(true) })
