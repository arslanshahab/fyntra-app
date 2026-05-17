# Fyntra — Attendance Management capability plan

> **Audience:** the next coding session. Pick up one PR at a time. Each PR is a
> few hours of work, backend + frontend together, in the cadence of the
> recently-merged `feat/parent-enhancements`, `feat/teacher-enhancements`,
> `feat/admin-enhancements` clusters.
>
> **Scope:** a single capability — first-class attendance management on top of
> the gate-only data we already have. **Not** period-level tracking. **Not**
> hardware changes. **Not** a new role.

---

## 1. Strategic framing

Today the product answers *"where is my child right now?"* and *"did anything
weird happen today?"* — alerts and visibility, built on top of `tap-in`,
`tap-out`, and the `LiveStatus` derivation in `apps/web/src/utils/attendanceStatus.ts`.
Schools using us as a pilot have asked us to also answer *"what's the official
record of this child's attendance for the month?"* — i.e. the paper register
they currently keep by hand.

**Attendance management, for us, is the school-policy-aware layer sitting on
top of the existing tap-derived `AttendanceRecord`.** Same data source (gates),
same per-day record, but with the rules schools actually run their registers
by: working days vs. weekends, holidays and exam days, half-day cutoffs,
class-teacher sign-off on the day's reading, structured override reasons, and
a printable monthly grid that matches what they keep on paper. The system
auto-fills the register from taps; the class teacher confirms, corrects, and
locks it.

The boundary against the existing alerts/visibility product is sharp:

| Alerts / visibility (existing) | Attendance management (this plan) |
|---|---|
| Real-time, per-event | Daily, per-record |
| "Is my child at school *right now*?" | "Was my child marked present *for today*?" |
| `LiveStatus` is derived on every render | `AttendanceRecord.status` is the durable register entry |
| Notifications fire per tap | Monthly summary fires once per month |
| Admin sees a live feed of taps | Admin sees a monthly register grid per class |

We do **not** track per-period or per-subject attendance, because we have no
classroom-side signal to derive it from. The class teacher confirming the
daily reading is the strongest signal we can produce from this hardware. The
plan never tries to invent more granularity than that.

---

## 2. Feature inventory

Features are grouped by audience. Within each group, items are listed in the
recommended build order — earlier items unlock later ones.

Effort tiers used below: **tiny** (<2 hr), **small** (~half a day),
**medium** (~1 day), **large** (~2 days). All counts assume the existing
conventions in the codebase (tenant filter first, `requireRole` gates, ≥1
cross-tenant negative test per module).

### 2.1 Admin — school policy & calendar

#### F1. School calendar (holidays, exam days, half-day Fridays)

- **Description:** Admin manages dated exceptions: gazetted holidays
  (`closed`), exam days where attendance isn't recorded (`exam`), and
  half-day Fridays / early-closure days (`half_day`).
- **Serves:** Admin. Underwrites every monthly register cell — without this,
  the register can't distinguish "no record because it was a holiday" from
  "no record because the system failed."
- **Consumes:** New `GET /holidays?from=&to=` listing. Initial seed = empty.
- **New API:** `GET /holidays`, `POST /holidays`, `PATCH /holidays/:id`,
  `DELETE /holidays/:id` — all admin-gated. Schema: `{ id, schoolId, date,
  label, kind: 'closed' | 'exam' | 'half_day', createdBy, createdAt }`.
- **New schema:** `school_holidays` table.
- **Cron:** the existing `runAbsentJobForSchool` (in
  `apps/api/src/services/attendance-jobs.ts`) must short-circuit if the
  given `ymd` lands on a `closed` or `exam` holiday for that school — no
  absent records, no parent fan-out.
- **Nav:** `Admin → Operations → Calendar` (new sidebar entry, alongside
  `Reports`, `Notifications`, `Anomalies`).
- **Effort:** medium.
- **Prereqs:** none.

#### F2. Attendance policy knobs (admin)

- **Description:** A single "Attendance policy" admin page exposing every
  rule the register depends on: working days of the week, half-day cutoff
  time, late/absent thresholds (today these are only seedable), and academic
  year boundaries.
- **Serves:** Admin. The class teachers never see this — they consume the
  policy implicitly through the register.
- **Consumes:** Existing `GET /me` already returns the `School` row; the
  parent home reads thresholds from there to render `LiveStatus`.
- **New API:** `PATCH /schools/me` (or `PATCH /schools/:id` scoped to the
  caller's school) — admin-gated. Body validates the new fields (see §3).
- **New schema:** add columns to `schools` — `working_days` (text[],
  default `['mon','tue','wed','thu','fri']`), `half_day_cutoff_time` (text,
  HH:MM, nullable — null = feature off), `academic_year_start` (date,
  nullable), `academic_year_end` (date, nullable).
- **Nav:** `Admin → Operations → Policy` (new sidebar entry). Or fold into
  the Calendar page if we want to keep nav lean.
- **Effort:** small (schema additive + one form).
- **Prereqs:** none, but ships best with F1 because both edit the same
  mental model ("the school year").

### 2.2 Class teacher — daily register flow

#### F3. Structured override reasons

- **Description:** The teacher's "Override" modal today takes a freeform
  text reason (see `TeacherTodayPage.tsx:472-486`). Replace it with a
  required dropdown of structured reasons + an optional freeform note. The
  freeform stays for nuance ("kid was at the nurse"), but the dropdown is
  what the monthly register reads to produce register codes.
- **Serves:** Class teacher (input), parent + admin (output — the register
  cell shows the right code).
- **Consumes:** existing `POST /tap-events/manual`.
- **New API:** `manualTapEventRequestSchema` (in `packages/schemas/src/index.ts`)
  gains a required `reasonKind` field (enum). Existing `reason` stays
  optional-freeform.
- **New schema:** new enum `tap_event_reason_kind` on the `tap_events`
  table — `forgot_card`, `out_of_band_tap`, `sick`, `leave`, `half_day`,
  `early_pickup`, `late_arrival`, `in_school_not_in_class`, `other`. Adds
  `manual_reason_kind` column, nullable (existing rows stay null).
- **Nav:** existing teacher today page — modal change only.
- **Effort:** small.
- **Prereqs:** none.

#### F4. Teacher register sign-off (lock the day)

- **Description:** On Teacher Today, once the class teacher has reviewed
  the roster and made any overrides, they hit "Lock register". Two effects:
  (a) any roster student without an `AttendanceRecord` for today gets an
  `absent` record auto-created (functionally a per-class on-demand absent
  job) with `isManual: true` and `manualReason: 'register_lock'`; (b) all
  records for that class on that date get `lockedAt` + `lockedBy` set.
  Locked records reject further manual overrides from non-admins (admin can
  unlock).
- **Serves:** Class teacher (closes their daily loop), parent (knows the
  day is final), admin (sees which classes have signed off today).
- **Consumes:** existing class roster + attendance queries.
- **New API:**
  - `POST /classes/:id/register/lock` body `{ date }` — teacher of that
    class, or admin. Returns the updated/created records.
  - `POST /classes/:id/register/unlock` body `{ date }` — admin only.
- **New schema:** add `locked_at` (timestamp, nullable) and `locked_by`
  (uuid → users, nullable) to `attendance_records`.
- **Nav:** Lock button on Teacher Today page header; Unlock from Admin →
  Monthly Register cell context menu (per F6).
- **Effort:** medium.
- **Prereqs:** F3 (so register-lock-created absent rows can carry a
  `reasonKind`).

### 2.3 The register itself — monthly view & exports

#### F5. Monthly class register (grid view)

- **Description:** The headline screen. Class × month grid:
  - rows = roster (sorted by roll number),
  - columns = days of the month (working days highlighted, weekends greyed,
    holidays show H / E / HD codes),
  - cells = single-letter register code (P, L, A, HD, E, H, or blank for
    future days),
  - per-student summary column on the right: working-days-in-month,
    present, absent, late, half-day, excused, attendance %.
  - last row: per-day totals across the class.
- **Serves:** Class teacher (their primary monthly artefact), admin
  (cross-class view of the same screen for any class).
- **Consumes:** existing `GET /attendance?from=&to=&classId=` + new
  holidays endpoint + school policy from `/me`.
- **New API:** `GET /classes/:id/register?month=YYYY-MM` returning a
  composed payload:
  ```
  {
    class: Class,
    month: "2026-05",
    days: [{ date, weekday, isWorkingDay, holiday?: { label, kind } }],
    students: Student[],
    records: AttendanceRecord[],
    summaries: [{
      studentId, workingDays, present, absent, late,
      halfDay, excused, attendancePct
    }]
  }
  ```
  Implementation = thin composer that joins the four sources server-side.
  This saves the frontend from doing four parallel fetches + a cross-join,
  and gives us one query key for cache invalidation.
- **New schema:** none. `attendance_status` enum gains `half_day` and
  `excused` and `holiday` to make the register codes a 1:1 mapping —
  recompute logic uses them (see §3). This is the migration risk to call
  out — pgEnum value addition is a forward-only migration.
- **Nav:**
  - Teacher: replace `Teacher → History` with `Teacher → Register`. The
    existing 30-day list view becomes a tab inside the monthly page.
  - Admin: new sidebar entry under People — `Admin → People → Register` —
    with a class picker at the top.
- **Effort:** large. Two layouts (desktop grid, mobile per-student card
  list), heavy data composition, lots of state for the month picker.
- **Prereqs:** F1 (holidays), F2 (working days), F4 (lock semantics so the
  grid can render a lock indicator per day).

#### F6. Printable monthly register (PDF + extended CSV)

- **Description:** Download the F5 grid as the school's paper register
  format — exactly what they would hand to a parent or keep in their
  ledger. Two formats:
  - **PDF**: A4 portrait, school header (name + month + class), the same
    grid, summary column, totals row, signature line for the class
    teacher. Print-friendly black-and-white.
  - **CSV**: extends the existing `/reports/attendance.csv` to include the
    new policy-aware columns (`HalfDay`, `Excused`, `Holiday`, `Locked`)
    and emit the same register-code letter (P/L/A/HD/E/H) per day.
- **Serves:** Class teacher (hands the PDF to admin), admin (archives /
  audit), parent (in F9, the same PDF is requestable per-student).
- **Consumes:** the F5 composed payload.
- **New API:** `GET /classes/:id/register.pdf?month=YYYY-MM` and
  `GET /classes/:id/register.csv?month=YYYY-MM`. Existing
  `/reports/attendance.csv?from=&to=&classId=` stays for date-range
  exports; the new endpoints are register-shaped.
- **New schema:** none.
- **Dependencies (runtime):** PDF generation — `pdfkit` or `puppeteer`.
  Lean toward `pdfkit` (no chromium); call out the decision in PR4.
- **Nav:** Download button on F5 page (both Teacher and Admin views).
- **Effort:** medium.
- **Prereqs:** F5.

### 2.4 Admin — operational rollup

#### F7. Cross-class daily roll-up

- **Description:** Admin dashboard gains a "Today's register" row showing,
  per class, whether the teacher has locked the day yet (locked / pending /
  no class) and the per-class headline (X present, Y absent, Z late). One
  glance tells the principal which class teachers still need to sign off.
- **Serves:** Admin / principal.
- **Consumes:** Existing class list + a new endpoint:
  `GET /attendance/today-summary` returning per-class roll-ups.
- **New API:** `GET /attendance/today-summary` — admin only. Returns
  `[{ classId, className, locked: boolean, lockedAt?, lockedBy?, totals:
  { present, absent, late, halfDay, excused, noRecord } }]`.
- **New schema:** none.
- **Nav:** new row on `Admin → Dashboard`, below the existing anomaly
  headline + 4-up stat cards.
- **Effort:** small.
- **Prereqs:** F4 (lock semantics need to exist for the indicator to be
  meaningful).

#### F8. Per-student attendance summary (admin + parent)

- **Description:** A small "Attendance summary" card shown on the existing
  Admin Student Detail page and on Parent Home (as the child card's
  secondary panel). Shows current-month and year-to-date counts: working
  days, present, late, half-day, absent, excused, attendance %.
- **Serves:** Admin (looking up a specific student), parent (their child
  card gets a second-tier metric).
- **Consumes:** New endpoint `GET /students/:id/attendance-summary?month=&year=`.
- **New API:** `GET /students/:id/attendance-summary` — query: optional
  `month=YYYY-MM` and `year=YYYY` (default = current month + current
  academic year if set, else calendar year). Returns
  `{ month: {...counts...}, year: {...counts...} }`.
- **New schema:** none.
- **Nav:** `Admin → Students → :id` (new section in existing detail page),
  `Parent → /parent` (new collapsible row on ChildCard).
- **Effort:** small.
- **Prereqs:** F1, F2 (so "working days this month" is computable).

#### F9. Parent monthly summary

- **Description:** End-of-month, the parent gets one notification per child:
  *"Ahmad's May attendance: 21/22 days present (95%). 1 late."* In-app +
  WhatsApp. They can tap through to the same per-student monthly grid as
  F5 (filtered to their child).
- **Serves:** Parent.
- **Consumes:** F8's `attendance-summary` endpoint.
- **New API:** none — fires through the existing `dispatch` path in
  `apps/api/src/modules/notifications/service.ts` with a new event type
  `monthly_summary` and a new WhatsApp template `fyntra_monthly_summary`.
- **New schema:** extend `notification_settings.events` with
  `monthly_summary: boolean` (default `true` for parents, hidden for
  admin/teacher). This is a one-line wire-schema change.
- **Cron:** new cron — last day of each month at 19:00 Karachi
  (configurable later). Reuse `node-cron` (already in use for the absent
  job). Iterates schools → classes → students → guardians, computes the
  summary, fans out.
- **Nav:** no new route — surfaces through existing parent notifications
  and (in F8) the child card on the home page.
- **Effort:** small + a medium-effort WhatsApp template registration.
- **Prereqs:** F8.

---

## 3. Schema + API changes (consolidated)

### 3.1 New tables

```sql
-- F1
CREATE TABLE school_holidays (
  id uuid PRIMARY KEY,
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  date date NOT NULL,
  label text NOT NULL,
  kind text NOT NULL,  -- 'closed' | 'exam' | 'half_day'  (pgEnum: holiday_kind)
  created_by uuid NOT NULL REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id, date)
);
CREATE INDEX school_holidays_school_idx ON school_holidays (school_id, date);
```

### 3.2 New columns on existing tables

**`schools`** (F2):
- `working_days text[] NOT NULL DEFAULT ARRAY['mon','tue','wed','thu','fri']`
- `half_day_cutoff_time text` (nullable)
- `academic_year_start date` (nullable)
- `academic_year_end date` (nullable)

**`tap_events`** (F3):
- `manual_reason_kind text` (nullable). Either store as text matching
  enum values, or add a `pgEnum tap_event_reason_kind`. Lean toward the
  enum for parity with the existing `tap_source` and `tap_direction`
  enums.

**`attendance_records`** (F4):
- `locked_at timestamptz` (nullable)
- `locked_by uuid REFERENCES users(id) ON DELETE SET NULL` (nullable)

### 3.3 Enum extensions (migration risk to call out)

**`attendance_status`** (F5) gains `half_day`, `excused`, `holiday`.

Postgres enum values can be added (`ALTER TYPE ... ADD VALUE`) but **not
removed** without recreating the type. This is forward-only. Two safety
properties to preserve:

1. Old wire consumers that don't know the new values must not break. The
   web app validates every response through Zod — `attendanceStatusSchema`
   must be extended **before** the API can return a new value. Ship the
   schemas package bump in the same PR that adds the values.
2. The new values are only **emitted** by code we control (the recompute
   service + the holiday-aware short-circuit). Backfill is not required —
   existing rows stay valid.

`tap_event_reason_kind` (F3) is a brand-new pgEnum, no risk.
`holiday_kind` (F1) ditto.

### 3.4 API endpoints — full list

All routes go through the existing `requireAuth` middleware. The role gate
is called out per route.

| Feature | Method | Path | Role | Body / Query |
|---|---|---|---|---|
| F1 | `GET` | `/holidays?from=&to=` | any auth | — |
| F1 | `POST` | `/holidays` | admin | `{ date, label, kind }` |
| F1 | `PATCH` | `/holidays/:id` | admin | `{ label?, kind? }` |
| F1 | `DELETE` | `/holidays/:id` | admin | — |
| F2 | `PATCH` | `/schools/me` | admin | `{ workingDays?, halfDayCutoffTime?, academicYearStart?, academicYearEnd?, lateThresholdMinutes?, absentThresholdMinutes? }` |
| F3 | `POST` | `/tap-events/manual` | teacher/admin | **add** `reasonKind` to existing body |
| F4 | `POST` | `/classes/:id/register/lock` | teacher (of class) / admin | `{ date }` |
| F4 | `POST` | `/classes/:id/register/unlock` | admin | `{ date }` |
| F5 | `GET` | `/classes/:id/register?month=YYYY-MM` | teacher (of class) / admin | — |
| F6 | `GET` | `/classes/:id/register.pdf?month=YYYY-MM` | teacher (of class) / admin | — |
| F6 | `GET` | `/classes/:id/register.csv?month=YYYY-MM` | teacher (of class) / admin | — |
| F7 | `GET` | `/attendance/today-summary` | admin | — |
| F8 | `GET` | `/students/:id/attendance-summary?month=&year=` | parent (of) / teacher (of class) / admin | — |
| F9 | — (cron + dispatch) | — | — | — |

### 3.5 Cron / job additions

- **F1 effect on absent cron:** `runAbsentJobForSchool` (in
  `apps/api/src/services/attendance-jobs.ts`) short-circuits when `ymd`
  is a `closed` or `exam` holiday for the school. Existing tests
  (`attendance-jobs.test.ts`) gain a "skips on holiday" case.
- **F9 monthly cron:** new cron `0 19 28-31 * *` Karachi (last day of
  month — guarded inside the handler against firing on the 28th/29th/30th
  when it isn't actually the last day). Bootstrap alongside the existing
  `bootstrapAbsentJobs`.

### 3.6 Wire schema additions to `@fyntra/schemas`

- `holidayKindSchema = z.enum(['closed', 'exam', 'half_day'])`
- `holidaySchema = z.object({ id, schoolId, date, label, kind, createdBy, createdAt })`
- `attendanceStatusSchema` adds `half_day`, `excused`, `holiday`
- `tapEventReasonKindSchema = z.enum([...])`
- `manualTapEventRequestSchema` adds `reasonKind` (required)
- `attendanceRecordSchema` adds `lockedAt?`, `lockedBy?`
- `schoolSchema` adds `workingDays`, `halfDayCutoffTime?`, `academicYearStart?`, `academicYearEnd?`
- `notificationSettingsSchema.events` adds `monthly_summary` (boolean)
- `classRegisterResponseSchema` (new): the F5 composed payload
- `studentAttendanceSummarySchema` (new): the F8 payload

---

## 4. Configuration surface (admin knobs)

The settings the school can tune. Some are already on `schools` (kept here
for completeness so the policy page is one screen). Defaults reflect what
the pilot school in Lahore most likely runs.

| Knob | Type | Default | Description / UI |
|---|---|---|---|
| `startTime` | `HH:MM` | `07:45` | Existing. Daily school start (Karachi). Drives late & absent thresholds. |
| `endTime` | `HH:MM` | `13:30` | Existing. Daily school end. Drives `left_early`. |
| `lateThresholdMinutes` | int ≥0 | `10` | Existing. Tap-in after `startTime + late` → `late`. |
| `absentThresholdMinutes` | int ≥0 | `30` | Existing. No tap-in by `startTime + absent` → `absent` (parent alert). |
| `workingDays` | weekday multi-select | Mon–Fri | F2. Which weekdays count for the register. Saturday school = check Sat. Sunday + Friday weekend = uncheck Fri. |
| `halfDayCutoffTime` | `HH:MM` or null | null | F2. If set, a tap-out before this clock time downgrades the day's status from `present` / `left_early` to `half_day`. Null = feature off; `left_early` stays the only "left before end" status. |
| `academicYearStart` | date or null | null | F2. Used by F8 "year-to-date" summary. Null = falls back to current calendar year. |
| `academicYearEnd` | date or null | null | F2. Pair of above. |
| Holiday calendar | list of `{date, label, kind}` | empty | F1. Add/remove dated exceptions. `closed` = absent cron skipped, register shows H, no parent alerts. `exam` = same as closed but rendered differently in the grid (helpful when admins reconcile against exam dates). `half_day` = `endTime` for that date is overridden by `halfDayCutoffTime` (or, if also null, the register cell is `HD` for everyone who left before `endTime`). |

Where this lives: **`Admin → Operations → Policy`** (single page, all
knobs in one form, save action). **`Admin → Operations → Calendar`**
(separate, calendar-shaped UI for the holiday list — easier to scan
visually than a row-per-holiday form).

The two pages compose: Policy is the static rules, Calendar is the dated
exceptions. The class teacher and parent never see either — they see the
policy's effects, not the controls.

---

## 5. Edge cases & policy decisions

Questions a real Lahore school admin would ask. Each one is a decision
the next session (or the user) needs to make before code lands. Numbered
for easy reference when answering.

### 5.1 Half-day mechanics

1. **What time counts as half-day?** Default proposed: `halfDayCutoffTime
   = 12:00`. If a student taps out before this, the day is `half_day`.
   Is a single cutoff right, or do schools want it relative to `endTime`
   (e.g. "left before midpoint = half-day")?
2. **Late + half-day combo.** If a student arrives at 9:30 (late) and
   leaves at 11:30 (before half-day cutoff), is the day `late` or
   `half_day`? Both? Today the recompute is a single-status field. We
   could either pick a priority (proposed: `half_day` wins, since the
   percent-attended math is more honest), or extend the status to be a
   tuple. Single status is simpler — go with priority unless schools
   push back.
3. **Half-day Friday vs. half-day exception day.** F1 says `half_day`
   holiday kind. Does that override `halfDayCutoffTime` for that
   specific date, or compose with it? Proposed: on a `half_day` holiday
   date, the school's effective `endTime` becomes `halfDayCutoffTime`
   (or the seed's literal `endTime` for that day), and everyone who tapped
   out before it is `present`, not `half_day` or `left_early`. In other
   words: the holiday declares the day was short, so leaving early isn't
   "early".

### 5.2 Absent vs. excused

4. **Tap-in but actually absent from class.** Today the override flow
   creates a manual tap-event. Should `reasonKind = in_school_not_in_class`
   surface as `excused` or `present`? Proposed: `present` but with a flag
   in the register cell (e.g. P with an asterisk). The kid was physically
   on campus.
5. **No tap, teacher confirms present.** Teacher overrides with
   `reasonKind = forgot_card`. Proposed: counts as `present`.
6. **No tap, teacher confirms absent with reason `leave`.** Proposed:
   counts as `excused`. The attendance % calculation
   (working-days-attended / working-days) should treat excused as
   present (or as a third bucket — see Q11).
7. **Absent retroactively becomes excused.** A student is marked
   `absent` by the cron, then 3 days later the parent submits a sick
   note and admin updates. Today there's no "edit past day" UI. F4's
   unlock semantics already cover this — admin unlocks the day, the
   teacher (or admin) submits an override, the day re-locks. Or do
   admins want an explicit "edit past day" form?

### 5.3 Working days & weekends

8. **Saturday school.** Some schools in Lahore run a 6-day week. F2
   handles this via `workingDays`. But the absent cron today is hard-coded
   `* * 1-5` (Mon–Fri in `node-cron`). It needs to consult `workingDays`
   and only fire on configured days. Worth confirming: do we expose the
   weekend convention up to the cron level, or just to the register
   rendering?
9. **Mid-year change to working days.** If a school adds Saturday in
   March, does the year-to-date summary recompute "working days so far"
   under the new policy? Proposed: yes — the count is derived on read,
   so it always reflects the current policy. Surface this if a school
   asks why their February % went up.

### 5.4 The register lock

10. **Who can lock if the class teacher is absent?** Proposed: admin can
    lock on behalf of any class. The lock record's `lockedBy` reflects
    the admin, not the teacher. Optional: a "marked on behalf" badge in
    the register cell.
11. **What if a tap arrives after lock?** Proposed: the tap is recorded
    (we don't lose data), but the `recomputeAttendanceForDay` short-
    circuits when `lockedAt` is set, so the locked status doesn't get
    overwritten. The anomaly center already exists — surface this as a
    new anomaly kind, `tap_after_lock`.
12. **Auto-lock at end of day?** Proposed: no, for the first cut. The
    teacher always explicitly locks. If teachers consistently forget,
    we add an admin-configurable "auto-lock at HH:MM" knob later.

### 5.5 Attendance percentage math

13. **% formula.** Proposed: `(present + late + halfDay × 0.5) /
    workingDays`. Excused days don't reduce the percentage (numerator
    gains a fraction, denominator doesn't change) — i.e. excused doesn't
    count as absent. Is that what schools want? Some schools count
    excused as half-credit. Easy to make a knob (`excusedCountsAs`:
    `present | half | absent`) if needed.
14. **Working days vs. attended days when months overlap holidays.**
    E.g. May has 22 weekdays, 2 of which are gazetted holidays — the
    denominator should be 20, not 22. Proposed: `workingDays - holidays
    (closed + exam kinds)`. `half_day` holidays still count as 1.

### 5.6 Parents and notifications

15. **Monthly summary opt-out.** Default `true` (per F9) — but parents
    have already set their notification preferences. Some will see this
    as a new channel. Proposed: ship it with `default = true`, log a
    one-time in-app notice ("we send a monthly summary now — you can
    turn this off in Settings").
16. **Monthly summary for a child with zero days attended.** Edge case
    — kid was sick all month. The summary still fires. Does the
    template need a separate variant ("Ahmad was absent for May —
    contact the school")? Proposed: ship one template, soften the copy.

### 5.7 PDF & paper-compatibility

17. **What does the school's current paper register look like?** We're
    designing F6 against a generic monthly-grid layout. If the pilot
    school has a specific format (school letterhead, column order, a
    signature line for a vice-principal), we want to match it before
    the first PDF goes out the door.
18. **Single-page vs. multi-page PDF for large classes.** A roster of
    40+ students on A4 portrait probably needs landscape or a second
    page. Proposed: switch to landscape for > 30 students; single
    page either way.

---

## 6. Recommended PR sequence

Each PR is sized like the recently-merged ones (a few hours, backend +
frontend together, single concept). Order matters for dependencies but
PRs are independently shippable as long as their prereq has merged.

### PR 1 — `feat/school-calendar` (F1)

**What:** `school_holidays` table, CRUD endpoints, admin Calendar page,
absent-cron short-circuit on holidays.

**Why first:** every later PR depends on knowing what counts as a
"working day" with respect to dated exceptions. Also the
lowest-controversy starting point — pure additive, no enum changes, no
data migration risk.

**Backend:** new module `apps/api/src/modules/holidays/`
(routes/service/repository/test). `attendance-jobs.ts` checks for
`closed | exam` holidays before running. Test gains "skips on holiday".

**Frontend:** new page `apps/web/src/pages/admin/AdminCalendarPage.tsx`,
sidebar entry under Operations, list view with add/edit/delete modals.
Reuse `Modal`, `SearchBar` (filter by year), `Badge` (kind chip).

**Unlocks:** F5 (register cells need holiday data), F7 (rollup needs
"is this a working day"), F9 (summary needs working days).

**Effort:** medium.

### PR 2 — `feat/attendance-policy` (F2 + F3)

**What:** policy fields on `schools`, admin Policy page, structured
override reasons.

Bundled because they're both "admin tunes the rules" + "teacher uses
the rules". They share schema PRs (`schools` columns + new pgEnum) and
they're both small. Mirrors the cadence of `feat/admin-enhancements`
(sidebar nav + dashboard headline in one PR).

**Backend:**
- `PATCH /schools/me` (admin), expanded `schoolSchema` in
  `@fyntra/schemas`, `/me` returns the new fields.
- `manualTapEventRequestSchema.reasonKind` becomes required. New
  pgEnum `tap_event_reason_kind`. `tap_events.manual_reason_kind`
  column. Existing manual-tap test covers the new required field.

**Frontend:**
- new page `AdminPolicyPage.tsx` (a single form, save button).
- `TeacherTodayPage.tsx`: replace the freeform textarea with a
  dropdown (required) + an optional notes field. The existing
  override-success copy stays.

**Unlocks:** F4 (register lock needs `reasonKind` on the
auto-created absent rows), F5 (register cells render the right code
per reason).

**Effort:** small.

### PR 3 — `feat/register-lock` (F4)

**What:** lock / unlock the class teacher's daily register.

**Backend:**
- `attendance_records.locked_at`, `locked_by` columns.
- `POST /classes/:id/register/lock` (teacher of class / admin), bulk-
  inserts absent rows for any rostered student without a record, then
  sets `lockedAt` + `lockedBy` on every record for the class on that
  date.
- `POST /classes/:id/register/unlock` (admin only) clears the lock.
- `recomputeAttendanceForDay` short-circuits when `lockedAt` is set.
- `manual` tap-events for locked (student, date) rows from non-admins
  → 409.

**Frontend:**
- "Lock register" button in the Teacher Today header (visible only
  when at least one student in the class still has no record, or
  always — pick one in PR 3). Confirm dialog before lock.
- Locked-day banner replaces the button when the day is locked,
  shows who locked at what time, with a "Request unlock" link
  (mailto / contact admin — no in-app workflow yet).
- Existing `LiveTapFeed.tsx` and `ChildTimelinePage.tsx` show a
  small "locked" indicator next to records where `lockedAt` is set.

**Unlocks:** F5 (the register cell shows locked / unlocked state),
F7 (rollup uses the lock flag).

**Effort:** medium.

### PR 4 — `feat/monthly-register` (F5 + F6 + F7)

**What:** the headline screen and its exports + the admin rollup.

Bundled because F5 is the centrepiece, F6 is a download button next to
it, and F7 is one row on the existing admin dashboard — separating them
would be three sub-day PRs with thin context each. Mirrors
`feat/parent-enhancements` cadence (one PR, several related slices).

**Backend:**
- pgEnum `attendance_status` adds `half_day`, `excused`, `holiday`.
- `recomputeAttendanceForDay` learns the half-day cutoff (Q1 / Q3) +
  reason-kind → status mapping (Q4 / Q5 / Q6).
- `GET /classes/:id/register?month=YYYY-MM` (composed payload).
- `GET /classes/:id/register.pdf?month=YYYY-MM` (pdfkit).
- `GET /classes/:id/register.csv?month=YYYY-MM`.
- `GET /attendance/today-summary` (admin).
- `@fyntra/schemas` adds `classRegisterResponseSchema`,
  `todaySummarySchema`, extended `attendanceStatusSchema`.

**Frontend:**
- new page `TeacherRegisterPage.tsx` — desktop grid, mobile per-
  student card list, month picker, download buttons. Replaces
  `TeacherHistoryPage` (old 30-day list becomes a "List view" tab
  inside the new page).
- new page `AdminClassRegisterPage.tsx` — same component, admin
  shell + class picker at the top.
- `AdminDashboardPage.tsx` gains a "Today's register" section
  reading `today-summary` — one row per class, status chip, totals.
- nav: `Teacher → Register` replaces `Teacher → History`. Admin gets
  `Admin → People → Register`.
- new molecule: probably one — `RegisterCell` (single-letter code +
  tooltip with reason). The rest composes existing atoms (`Badge`,
  `StatBlock`, `Avatar`, `SearchBar`).

**Unlocks:** F8 (parent monthly summary card references the same
month view via a deep link).

**Effort:** large. This is the only PR that runs a full day.

### PR 5 — `feat/attendance-summaries-and-monthly-digest` (F8 + F9)

**What:** per-student summary card + parent monthly notification.

Bundled because they share the `GET /students/:id/attendance-summary`
endpoint and a single WhatsApp template.

**Backend:**
- `GET /students/:id/attendance-summary?month=&year=`. Reuses
  reports/holidays repos for the math.
- new cron in `attendance-jobs.ts` for end-of-month dispatch. New
  notification event `monthly_summary`. New WhatsApp template
  `fyntra_monthly_summary`. `notificationSettings.events` adds the
  new key with default `true` for parents.

**Frontend:**
- `ChildCard` (existing molecule) gains a collapsed "This month"
  row showing P / A / L / % from the summary endpoint, with a
  deep link to the F5 register filtered to the child.
- `AdminStudentDetailPage` adds an Attendance Summary section
  (current month + year).
- `ParentSettingsPage` exposes the `monthly_summary` toggle.

**Unlocks:** nothing — this is the end of the capability.

**Effort:** small + a small WhatsApp template registration.

---

### Sequencing summary

```
PR 1 (calendar)          → PR 2 (policy + reasons)
                              ↓
                         PR 3 (register lock)
                              ↓
                         PR 4 (monthly register + exports + rollup)
                              ↓
                         PR 5 (summaries + parent digest)
```

PRs 1 and 2 can run in parallel if two sessions exist. PRs 3, 4, 5 are
strictly sequential.

---

## 7. Explicit out-of-scope

Adjacent features that look related but should **not** land in this
capability:

- **Per-period / per-subject attendance.** No hardware signal, no
  reliable derivation. Out for the lifetime of gate-only readers.
- **Authorised-pickup verification.** Conceptually adjacent (the
  tap-out is "who left with whom"), but needs a new identity model
  (guardian taps, photo confirmation, etc.) and is Phase 3 per the
  existing README §13–14.
- **Headmaster / Coordinator role.** The user's brief is explicit:
  class-teacher + admin is sufficient. Don't introduce a third role.
- **Multi-school super-admin.** Phase 2.3 territory; one school per
  JWT is fine for this capability.
- **Student transfer between classes / mid-year roster changes.**
  Today the register query is keyed on `classId`. A student who
  transfers from 3-A to 3-B mid-month will have their May register
  split across two grids. This is a real edge case but rare enough to
  push to a later cleanup PR — call out the gotcha in the PR-1
  README update so the school knows.
- **Bulk holiday import (CSV upload of the year's gazetted holidays).**
  Nice-to-have. F1's add-one-at-a-time UI is sufficient for the
  pilot. Add bulk import later if real schools hit it as a friction.
- **Acknowledging anomalies.** Carried over from the Phase 2.1 spec
  ("Anomaly resolution — deferred"). The new `tap_after_lock` anomaly
  kind from §5.4 Q11 sits in the same backlog.
- **Notification quiet hours.** Worth doing eventually (don't ping at
  3am if the monthly cron mis-fires), but the F9 cron runs at 19:00
  Karachi specifically so quiet-hours isn't needed for the first cut.
- **Mobile-app PWA install nudges around the register.** Not in this
  capability. Stays with the existing PWA shell work.
- **Auditable register revisions (diff between successive locks).**
  Once locked, edits should arguably show "what changed". Today the
  `tap_events` audit trail captures this implicitly (every manual
  override creates a row). Don't build a separate diff UI yet.

---

## 8. Locked decisions (answers to the three blocking questions)

These are the defaults the next session ships against. Each is
override-able later via a small migration or a new admin knob, but PR
work doesn't block on confirmation — start coding with these.

### 8.1 Half-day mechanics (resolves §5.1 Q1–Q3)

**Decision: both mechanisms, with the holiday-date model dominant.**

Two independent half-day concepts exist; they're not interchangeable:

- **(a) The school day itself is short.** Recurring Fridays, exam
  week, parent-teacher-meeting mornings. This is a property of the
  *date*, not the student. Model: `school_holidays.kind = 'half_day'`
  with a required `effective_end_time` column. On those dates, the
  school's effective `endTime` is the holiday's `effective_end_time`,
  and the recompute treats it as the day's true end. **The register
  column header shows HD; per-student statuses on that date are
  computed against the shortened schedule and most students will be
  `present`.**

- **(b) A specific student bolted early on a regular school day.** Kid
  leaves at noon on a 14:00 endTime day. Model: school-wide
  `halfDayCutoffTime` knob on `schools` (HH:MM, nullable, default null).
  When set, the recompute downgrades `left_early` to `half_day` for
  any student whose `lastOutAt` is before the cutoff on a non-half-day
  date. Null = feature off (no `half_day` per-student statuses are
  ever emitted on regular days; `left_early` stays the only "left
  before end" code).

The two compose cleanly because they apply on disjoint date sets — a
date is either a `half_day` holiday or it isn't. On a `half_day`
holiday date, the cutoff is ignored. On a regular day, the cutoff (if
set) does its work. **`schools.halfDayCutoffTime` ships as null by
default for the pilot** — meaning we ship with only mechanism (a)
turned on. The cutoff goes in the schema in PR 2 so it's available,
but the pilot admin opts in via the Policy page when they decide they
want it.

**Implementation consequence for PR 4:**
- `attendance_status` enum gains `half_day` (for student-level HD via
  cutoff) and `holiday` (for `closed | exam` dates only — `half_day`
  holiday dates produce normal `present` / `late` / `absent`
  per-student statuses against the shortened schedule).
- `school_holidays` gains `effective_end_time text` (nullable; required
  by validation when `kind = 'half_day'`).
- Register cell renderer:
  - cell shows **HD** if the column's date is a `half_day` holiday OR
    the row's record status is `half_day`,
  - cell shows **H** if `closed`, **E** if `exam`,
  - otherwise normal P / L / A / E (excused) / blank.

### 8.2 Attendance % formula (resolves §5.5 Q13)

**Decision: excused counts as present. Half-days get half credit.**

Formula:

```
attendanceCount = present + late + excused + (halfDay × 0.5)
percentage      = attendanceCount / workingDays × 100
workingDays     = configuredWorkingDays(month) − holidays(closed + exam)
```

Where `excused` is the count of `AttendanceRecord` rows whose status is
`absent` but whose creating tap-event has `manual_reason_kind IN
('sick', 'leave')`. (Status stays `absent` in the DB; the register cell
renderer shows **E** when the reason kind is in that set. We don't
introduce an `excused` enum value — saves an enum extension and keeps
the existing absent-cron path unchanged.)

Rationale for "excused = present (full credit)":
- Most generous to families on a parent-facing metric. Marking a sick
  kid down to 50% attendance for the month feels punitive.
- The school still sees the underlying counts (absent column shows the
  total raw absences; excused is a subset).
- If the pilot school disagrees, add `excusedCountsAs: 'present' |
  'half' | 'absent'` to the Policy page in a follow-up PR — the math
  is one constant in the summary code.

Half-day at 0.5 is the only obvious compromise; full credit understates
absence, zero credit overstates it.

### 8.3 Paper register format (resolves §5.7 Q17)

**Decision: ship a generic Pakistani-school-conventional A4 layout in
PR 4; iterate against the pilot's actual register after first delivery.**

I don't have the pilot school's register on hand, so PR 4 produces this
default layout and we adjust visually once they review it:

```
┌──────────────────────────────────────────────────────────────┐
│  [School name]                                  [logo space] │
│  Class: Grade 3 — Section A      Month: May 2026             │
├──────────────────────────────────────────────────────────────┤
│ Roll │ Student name        │ 1  2  3  4  5 ... 31 │ WD P A L HD E  % │
│  001 │ Ahmad Ali           │ P  P  L  P  P ... P  │ 22 20 1 1  0 0 95│
│  002 │ ...                                                          │
│  ...                                                                │
├──────────────────────────────────────────────────────────────┤
│ Daily totals — P / A / L:    18/2/2  19/1/2  ...                   │
├──────────────────────────────────────────────────────────────┤
│ Class teacher: _______________________   Date: _____________ │
│ Principal:     _______________________   Date: _____________ │
└──────────────────────────────────────────────────────────────┘
```

Layout decisions baked in:
- A4 portrait for classes up to 30; auto-switch to landscape at >30.
- Header: school name + class + month + year. Logo space placeholder
  (PDF includes it only if `schools.logo_url` is set — not in scope
  this capability, so the slot is blank in the first cut).
- Day columns numbered 1..N (N = days in month). Weekend / holiday
  cells shaded grey; column header above the number shows H / E / HD
  when applicable.
- Per-student summary on the right: WD (working days), P, A, L, HD, E,
  %. JetBrains Mono for all numeric columns (matches the rest of the
  app's tabular-nums convention).
- Daily totals row below the grid (P / A / L per column).
- Two signature blocks (class teacher, principal) — standard Pakistani
  school convention.
- Black-and-white throughout (school photocopies registers; colour
  doesn't survive).

When the pilot school sees PR 4's first PDF, expect 1–2 small tweaks
(column order, header phrasing, signature roles). Budget half an hour
in PR 4 for cosmetic adjustments after the first review.
