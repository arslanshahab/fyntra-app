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

// 3-letter weekday codes used by School.workingDays. Order matters in the
// admin UI's weekday picker; keep this stable.
export const weekdaySchema = z.enum(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'])
export type Weekday = z.infer<typeof weekdaySchema>

// "HH:MM" 24-hour Karachi-local time. Shared by School.halfDayCutoffTime and
// Holiday.effectiveEndTime.
const timeOfDayRegex = /^([01]\d|2[0-3]):[0-5]\d$/

export const schoolSchema = z.object({
  id: idSchema,
  name: z.string(),
  address: z.string(),
  timezone: z.literal('Asia/Karachi'),
  startTime: z.string(),
  endTime: z.string(),
  lateThresholdMinutes: z.number().int().nonnegative(),
  absentThresholdMinutes: z.number().int().nonnegative(),
  // Attendance-policy knobs added in PR 2. Always present on the wire —
  // the DB columns are NOT NULL (workingDays) or NULLABLE (the rest).
  workingDays: z.array(weekdaySchema),
  halfDayCutoffTime: z.string().regex(timeOfDayRegex).optional(),
  academicYearStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  academicYearEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
})
export type School = z.infer<typeof schoolSchema>

// PATCH /schools/me body — admin updates any subset of the policy knobs in
// one shot. All fields optional. `halfDayCutoffTime` accepts null to clear
// the value; `academicYearStart`/`End` likewise. The other fields cannot be
// cleared (NOT NULL columns).
export const patchSchoolRequestSchema = z
  .object({
    startTime: z.string().regex(timeOfDayRegex).optional(),
    endTime: z.string().regex(timeOfDayRegex).optional(),
    lateThresholdMinutes: z.number().int().nonnegative().max(180).optional(),
    absentThresholdMinutes: z.number().int().nonnegative().max(360).optional(),
    workingDays: z.array(weekdaySchema).min(1).max(7).optional(),
    halfDayCutoffTime: z.string().regex(timeOfDayRegex).nullable().optional(),
    academicYearStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
    academicYearEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  })
  .superRefine((value, ctx) => {
    // Academic year window — start must precede end when both set.
    if (value.academicYearStart && value.academicYearEnd && value.academicYearStart > value.academicYearEnd) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'academicYearStart must be on or before academicYearEnd',
        path: ['academicYearEnd'],
      })
    }
    // Daily window — startTime must precede endTime when both set.
    if (value.startTime && value.endTime && value.startTime >= value.endTime) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'startTime must be before endTime',
        path: ['endTime'],
      })
    }
  })
export type PatchSchoolRequest = z.infer<typeof patchSchoolRequestSchema>

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

export const deviceTokenSchema = z.object({
  id: idSchema,
  deviceId: idSchema,
  label: z.string(),
  createdAt: z.string(),
  revokedAt: z.string().optional(),
})
export type DeviceToken = z.infer<typeof deviceTokenSchema>

export const createDeviceRequestSchema = z.object({
  label: z.string().min(1).max(80),
  direction: deviceDirectionSchema,
})
export const patchDeviceRequestSchema = z.object({
  label: z.string().min(1).max(80).optional(),
  direction: deviceDirectionSchema.optional(),
})
export const createDeviceTokenRequestSchema = z.object({
  label: z.string().min(1).max(80),
})

export const tapDirectionSchema = z.enum(['in', 'out'])
export type TapDirection = z.infer<typeof tapDirectionSchema>
export const tapSourceSchema = z.enum(['device', 'manual'])

// Structured reason for a manual override. PR 2's monthly register (PR 4)
// reads this to emit register codes; the freeform `manualReason` stays for
// notes. Optional on `tapEventSchema` because rows seeded before the column
// existed have a NULL reason kind.
export const tapEventReasonKindSchema = z.enum([
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
export type TapEventReasonKind = z.infer<typeof tapEventReasonKindSchema>

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
  manualReasonKind: tapEventReasonKindSchema.optional(),
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
  // Anomaly flags — omitted from the wire when false (the 99% case).
  // See apps/api/src/modules/reports/service.ts for the "falsy → undefined"
  // mapping that keeps default rows clean.
  cardAnomaly: z.boolean().optional(),
  leftWithoutScan: z.boolean().optional(),
  flaggedForReview: z.boolean().optional(),
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

// E.164 phone numbers restricted to the three markets Fyntra supports today.
//   PK (+92):  mobile prefix `3`, then 9 digits.   e.g. +923001234567
//   UAE (+971): mobile prefix `5`, then 8 digits.  e.g. +971501234567
//   US (+1):    NANP area code starting 2-9, then 9 digits. e.g. +12025551234
// Update both this regex and the matching i18n copy when adding a new market.
export const PHONE_REGEX = /^(?:\+923\d{9}|\+9715\d{8}|\+1[2-9]\d{9})$/
export const phoneFieldSchema = z.string().regex(PHONE_REGEX)

export const requestOtpRequestSchema = z.object({ phone: phoneFieldSchema })
export const verifyOtpRequestSchema = z.object({
  phone: phoneFieldSchema,
  otp: z.string().regex(/^\d{4}$/),
})
export const assignCardRequestSchema = z.object({ cardId: idSchema, studentId: idSchema })
export const replaceCardRequestSchema = z.object({
  studentId: idSchema,
  newRfidUid: z.string(),
})
export const patchCardRequestSchema = z.object({ status: cardStatusSchema })
// Teachers and admins submit this when they need to correct the record —
// "kid forgot their card", "left early for a dentist", "out-of-band tap by
// the office staff". `reasonKind` is the structured value the register
// renders; `reason` stays as freeform notes for context.
export const manualTapEventRequestSchema = z.object({
  studentId: idSchema,
  direction: tapDirectionSchema,
  occurredAt: z.string(),
  reasonKind: tapEventReasonKindSchema,
  reason: z.string().min(1).max(500),
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

// --- School calendar (holidays) ---
//
// A dated exception to the regular school calendar. See
// docs/superpowers/specs/2026-05-17-fyntra-attendance-management.md §3.1
// for the full data model and §8.1 for half-day semantics.
//
//   - 'closed'   — school is shut. Absent cron short-circuits; register shows H.
//   - 'exam'     — attendance not recorded. Same cron behaviour as closed; register shows E.
//   - 'half_day' — school ends earlier than normal. `effectiveEndTime` is required
//                  (HH:MM, Karachi). Absent cron still runs; recompute treats the
//                  shortened end as the day's end. Register column shows HD.
export const holidayKindSchema = z.enum(['closed', 'exam', 'half_day'])
export type HolidayKind = z.infer<typeof holidayKindSchema>

// "HH:MM" 24-hour clock in Karachi local time.
const timeOfDaySchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Expected HH:MM 24-hour time')
const dateOnlySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD')

export const holidaySchema = z.object({
  id: idSchema,
  schoolId: idSchema,
  date: dateOnlySchema,
  label: z.string().min(1).max(120),
  kind: holidayKindSchema,
  effectiveEndTime: timeOfDaySchema.optional(),
  createdBy: idSchema.optional(),
  createdAt: z.string(),
})
export type Holiday = z.infer<typeof holidaySchema>

// Half-day kind requires effectiveEndTime; the other kinds reject it. This
// is enforced both on POST and PATCH so we never end up with a half_day row
// missing the early-end time (which the recompute logic relies on).
function requireEndTimeForHalfDay<T extends { kind?: HolidayKind; effectiveEndTime?: string }>(
  value: T,
  ctx: z.RefinementCtx,
): void {
  if (value.kind === 'half_day' && !value.effectiveEndTime) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'effectiveEndTime is required when kind is half_day',
      path: ['effectiveEndTime'],
    })
  }
  if (value.kind && value.kind !== 'half_day' && value.effectiveEndTime) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'effectiveEndTime is only allowed when kind is half_day',
      path: ['effectiveEndTime'],
    })
  }
}

export const createHolidayRequestSchema = z
  .object({
    date: dateOnlySchema,
    label: z.string().min(1).max(120),
    kind: holidayKindSchema,
    effectiveEndTime: timeOfDaySchema.optional(),
  })
  .superRefine(requireEndTimeForHalfDay)
export type CreateHolidayRequest = z.infer<typeof createHolidayRequestSchema>

export const patchHolidayRequestSchema = z
  .object({
    date: dateOnlySchema.optional(),
    label: z.string().min(1).max(120).optional(),
    kind: holidayKindSchema.optional(),
    // PATCH cannot null-out effectiveEndTime — to remove it, change kind
    // away from half_day. Keeps the half-day invariant a single rule.
    effectiveEndTime: timeOfDaySchema.optional(),
  })
  .superRefine(requireEndTimeForHalfDay)
export type PatchHolidayRequest = z.infer<typeof patchHolidayRequestSchema>
