# Fyntra — Admin class management (design spec)

> **Audience:** the next coding session. One PR, sized like
> `feat/register-lock` or `feat/school-calendar`: backend + frontend +
> tests + i18n in one slice.
>
> **Scope:** admin can add, rename, reassign, and delete classes for
> their school, picking the class teacher from existing teacher users.
> **Not** teacher user CRUD. **Not** student-to-class roster
> management. **Not** subject/period teachers.

---

## 1. Strategic framing

Today the `classes` table is a seed-only artefact. The product assumes
classes already exist when an admin logs in — created by the Fyntra
ops team during onboarding. This works for the pilot school but
doesn't scale: as soon as a second school onboards, or the pilot
school adds a new grade mid-year, an admin needs to make the change
themselves rather than ticket us.

This capability gives admins the smallest viable class-management
surface: add a class, set its class teacher, rename it, reassign the
teacher when staffing changes, delete it when it's no longer running.
The class teacher is the same singular role the rest of the app
already reads off `classes.teacher_id` — the daily register signer,
the Teacher Today owner, the `/me` `assignedClass` subject. No new
roles, no new permissions, no fanning-out of authorization across
junction tables.

The boundary against future "people management" work is sharp:

| In scope (this spec) | Adjacent (future PRs) |
|---|---|
| Create / rename / delete a class | Create / edit / delete a teacher user |
| Assign / reassign the class teacher | Move students between classes (bulk) |
| Refuse delete when students are enrolled | Soft-delete / archive a class |
| Read existing teachers via a new minimal `GET /users?role=teacher` | Full users CRUD (`POST/PATCH/DELETE /users`) |

---

## 2. Locked decisions

These were resolved during brainstorming. Listed up front so future
edits don't relitigate them.

1. **One class teacher per class.** Schema stays single-`teacher_id`.
   No junction table. Every existing auth check that reads
   `cls.teacher_id` keeps working unchanged.
2. **One class per teacher.** Enforced by a new DB unique index on
   `classes(school_id, teacher_id)`. Makes the implicit assumption in
   `meRepo.assignedClass` (which already does `.limit(1)`) explicit
   and prevents the silent-pick footgun.
3. **Full CRUD in v1.** Create, edit, delete. No "v1 = create only"
   half-step.
4. **Teachers come from existing users only.** The class form picks
   teachers from a new `GET /users?role=teacher` endpoint. Inline
   teacher creation is its own feature.
5. **Refuse delete when students are enrolled.** `students.class_id`
   has `ON DELETE RESTRICT`; we surface a friendly 409
   (`classHasStudents` with `studentCount`) rather than letting the
   DB error bubble. No soft-delete column added.
6. **Modal-only UI.** Single page with a table; add/edit/delete are
   modals. Matches `AdminCalendarPage` exactly. A dedicated
   `/admin/classes/:id` detail page is explicitly deferred.
7. **Nav placement: `Admin → People → Classes`.** Sits alongside
   Students and (existing) Register under People.

---

## 3. Schema + migration

One additive migration in `apps/api/src/db/migrations/`. Two changes
to `classes`, both narrowing rather than widening — no data
migration, no enum changes.

### 3.1 New FK on `classes.teacher_id`

Today the column is a bare `uuid('teacher_id').notNull()` (see
`apps/api/src/db/schema/schools.ts:32`) — no FK, no integrity
guarantee. The migration adds:

```sql
ALTER TABLE classes
  ADD CONSTRAINT classes_teacher_id_users_fk
  FOREIGN KEY (teacher_id) REFERENCES users(id)
  ON DELETE RESTRICT;
```

`ON DELETE RESTRICT` (not `CASCADE` or `SET NULL`) so deleting a
teacher user with an assigned class fails loudly. The admin has to
reassign the class first — the same UX as "can't delete a class with
students."

### 3.2 New unique index

```sql
CREATE UNIQUE INDEX classes_school_teacher_unique
  ON classes (school_id, teacher_id);
```

Composite with `school_id` so the cross-tenant story remains correct
(in principle, the same teacher id wouldn't appear in two schools
because users are school-scoped, but composite is the safer index
shape for tenant-scoped uniqueness).

### 3.3 Drizzle schema change

`apps/api/src/db/schema/schools.ts`:

```ts
import { users } from './auth.js'

export const classes = pgTable(
  'classes',
  {
    id: uuid('id').primaryKey(),
    schoolId: uuid('school_id').notNull().references(() => schools.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    teacherId: uuid('teacher_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    bySchool: index('classes_school_idx').on(t.schoolId, t.id),
    byTeacherUnique: uniqueIndex('classes_school_teacher_unique').on(t.schoolId, t.teacherId),
  }),
)
```

(Imports the `users` table from `./auth.js` — Drizzle handles the
forward reference fine because both schema files are loaded before
the FK is applied.)

### 3.4 Migration preflight

Before applying the FK, the migration script asserts no stray rows:

```sql
SELECT COUNT(*) FROM classes c
LEFT JOIN users u ON c.teacher_id = u.id
WHERE u.id IS NULL;
-- expect 0; refuse migration if > 0
```

Seed data is consistent today, so this is a belt-and-suspenders check
for dev/staging where someone might have hand-inserted a row. Nil
risk in pilot prod.

### 3.5 Schema-package changes

`classSchema` gains one optional field — `studentCount` — so the admin
list can render the count column without a second round trip and
without the paginated `/students` cap problem (the admin students
list silently caps at 100; see project memory). Optional so existing
parent / teacher consumers that don't care can keep the same wire
shape; the server fills it for every caller.

New request schemas are write-only:

```ts
// packages/schemas/src/index.ts (changes + additions)
export const classSchema = z.object({
  id: idSchema,
  name: z.string(),
  teacherId: idSchema,
  schoolId: idSchema,
  studentCount: z.number().int().nonnegative().optional(),
})

export const createClassRequestSchema = z.object({
  name: z.string().trim().min(1).max(60),
  teacherId: idSchema,
})
export type CreateClassRequest = z.infer<typeof createClassRequestSchema>

export const patchClassRequestSchema = z
  .object({
    name: z.string().trim().min(1).max(60).optional(),
    teacherId: idSchema.optional(),
  })
  .refine((v) => v.name !== undefined || v.teacherId !== undefined, {
    message: 'at least one field is required',
  })
export type PatchClassRequest = z.infer<typeof patchClassRequestSchema>
```

Adding `studentCount` as `optional()` keeps the rest of the consumers
(`/classes/:id/register`, `/me`) compatible — they don't need to
populate it. The server populates it on `GET /classes` and `POST /classes`
(new class always has `studentCount: 0`); `PATCH /classes/:id`
returns it too. `DELETE` doesn't return a class.

A minimal users-list response schema (for the picker):

```ts
export const teacherPickerEntrySchema = z.object({
  id: idSchema,
  fullName: z.string(),
})
export const teacherPickerListSchema = z.array(teacherPickerEntrySchema)
export type TeacherPickerEntry = z.infer<typeof teacherPickerEntrySchema>
```

---

## 4. API surface

All routes behind `requireAuth`. Role gates live in the service so
the (404 → 403) ordering stays correct, matching the existing
classes lock/unlock pattern (`apps/api/src/modules/classes/service.ts:62`).

| Method | Path | Role | Body / Query | Returns |
|---|---|---|---|---|
| `POST` | `/classes` | admin | `{ name, teacherId }` | `Class` (201) |
| `PATCH` | `/classes/:id` | admin | `{ name?, teacherId? }` (≥1) | `Class` |
| `DELETE` | `/classes/:id` | admin | — | `{ ok: true }` |
| `GET` | `/users?role=teacher` | admin | — | `TeacherPickerEntry[]` |

### 4.1 Error shape

Standard Fastify error mapping plus these service-specific 409s:

| Status | Error key | Triggered by | Body |
|---|---|---|---|
| 404 | `notFound` | cross-tenant id or missing class | `{ error: 'notFound' }` |
| 403 | `forbidden` | non-admin caller | `{ error: 'forbidden' }` |
| 409 | `classHasStudents` | `DELETE` with enrolled students | `{ error: 'classHasStudents', studentCount: N }` |
| 409 | `teacherAlreadyAssigned` | `POST`/`PATCH` with a teacher who already runs another class | `{ error: 'teacherAlreadyAssigned', existingClassId, existingClassName }` |
| 400 | `teacherNotEligible` | `teacherId` doesn't exist, isn't in this school, or isn't role=teacher | `{ error: 'teacherNotEligible' }` |
| 409 | `classNameTaken` | `POST`/`PATCH` rename collides (case-insensitive) with another class in the school | `{ error: 'classNameTaken', existingClassId }` |

Service catches the DB unique-constraint violation
(Postgres error code `23505`) on the `(school_id, teacher_id)` index
and converts it to the structured `teacherAlreadyAssigned`. Service
catches no other DB errors — they bubble as 500s, matching the rest
of the API.

### 4.2 Name uniqueness

Service-level only (`SELECT` before `INSERT`/`UPDATE`), not a DB
constraint. This is deliberate: a friendly "Grade 3A already exists"
message beats a generic constraint violation. A second-admin race
that slips through (both pass the check before either inserts) is
acceptable — same-name classes are a usability nit, not a referential
bug. If the pilot hits the race for real, add `UNIQUE (school_id,
lower(name))` later.

### 4.3 The `GET /users?role=teacher` endpoint

Genuinely new — no `/users` listing exists today. Tight scope for
this spec:

- **Path:** `GET /users?role=teacher`
- **Role gate:** admin only (service-enforced; reuses the
  `ForbiddenError` pattern).
- **Query validation:** `role` is currently a single-value
  `z.enum(['teacher'])` — strict-by-design so we don't accidentally
  ship a generic list endpoint. When teacher user CRUD lands, the
  enum widens to `z.enum(['teacher', 'parent'])` (admins listing
  parents) and the schema/handler grows naturally.
- **Response:** `[{ id, fullName }]`. Ordered by `fullName` ASC.
  Includes every teacher in the school, *whether or not* they're
  currently a class teacher. The frontend joins against the existing
  classes list to mark unavailable teachers (better UX than the
  server pre-filtering — see §5.2).
- **Pagination:** none for v1. Pilot schools have <20 teachers; the
  payload is tiny. When a school hits 50+, swap to `useCursorList`
  using the existing `lib/pagination.ts` helper.
- **Tests:** lists teachers in caller's school only; rejects parent;
  rejects teacher; cross-tenant negative test.

### 4.4 Cache invalidation

Frontend mutations invalidate `classKeys.list`
(`apps/web/src/features/classes/queries.ts:9`). The existing 5-minute
staleTime is wiped to fresh, and every consumer (the admin students
filter, parent/admin nav, Teacher Today rebound) re-fetches on next
read. No additional cache keys; classes don't have a detail-key today.

`useEligibleTeachersQuery()` invalidates on class create/patch/delete
too, because the "already teaches" suffix in the picker depends on
the classes list and a freshly-created class needs to gray out its
teacher immediately.

---

## 5. Frontend

One new page + one new feature module + sidebar wiring + i18n.

### 5.1 Page: `AdminClassesPage.tsx`

Path: `/admin/classes`. Imported lazily in
`apps/web/src/app/routes.tsx` next to `AdminStudentsPage`, under the
existing admin layout.

Shape (desktop):

```
Classes                                       [+ Add class]
┌──────────────┬─────────────────┬──────────┬───────────────────┐
│ Name         │ Class teacher   │ Students │ Actions           │
├──────────────┼─────────────────┼──────────┼───────────────────┤
│ Grade 3A     │ Ms. Khan        │    28    │ Edit  ·  Delete   │
│ Grade 3B     │ Mr. Ahmed       │    25    │ Edit  ·  Delete   │
│ Grade 4A     │ Mr. Iqbal       │     0    │ Edit  ·  Delete   │
└──────────────┴─────────────────┴──────────┴───────────────────┘
```

- **Sort:** alphabetical by `name`. Stable, matches the picker in
  `AdminStudentsPage`.
- **Student count column:** read directly from the new
  `studentCount` field on each class row (`GET /classes` populates it
  via a `LEFT JOIN students` + `COUNT(*)` aggregate). The count
  includes **all** students with `class_id = this class`, regardless
  of `status` (active *and* inactive). Reason: the `students.class_id`
  FK is `ON DELETE RESTRICT`, so deleting a class with any student
  row (active or inactive) fails at the DB level. Counting only
  active would show "0" while delete still 409s — confusing. The
  delete-confirm modal uses the same total. No client-side join, no
  exposure to the `/students` paginated 100-row cap.
- **Empty state:** `StatusCard` with `Users` icon, copy
  `t('admin.classes.empty')` = "No classes yet. Add the first one."
- **Loading state:** skeleton rows mirroring `AdminStudentsPage`.
- **Error state:** `StatusCard` with `AlertTriangle`, retry button.
  Same pattern as the rest of the admin pages.
- **Mobile:** card list (one card per class, rows stacked). Same
  pattern as `AdminCardsPage`'s mobile fallback.

### 5.2 Modals

All three reuse `components/molecules/Modal.tsx`. The page tracks
modal state with three `useState` calls — `showAddForm`, `editing:
Class | null`, `deleting: Class | null` — mirroring `AdminCalendarPage`.

**Add / Edit form (shared component):**

- Fields:
  - `name` — text input, max 60, required, trimmed on submit.
  - `Class teacher` — native `<select>` populated by
    `useEligibleTeachersQuery()`. Edit-mode preselects
    `class.teacherId`.
- Picker semantics:
  - Eligible teachers (not currently assigned to any class) are
    listed first, plain.
  - Teachers already assigned to *another* class are listed second,
    visually distinct (greyed out, `disabled` attribute on the
    `<option>`), with the label "Ms. Khan (already teaches Grade 3B)".
  - In edit mode, the current class's own teacher is always selectable.
- Submit button:
  - Disabled until both fields valid AND form is dirty (compared
    against the initial class state for edit mode).
  - On success, modal closes, table refetches, an inline success
    banner appears at the top of the page for 4s (using the existing
    `banner` state shape from `AdminCalendarPage:77`).
- Error display:
  - Server errors map to localised copy: `classNameTaken` →
    "A class with this name already exists.";
    `teacherAlreadyAssigned` → "{name} is already the class teacher
    of {existingClassName}." Errors are shown inline above the form
    body (red banner inside the modal), never as toasts — matches
    `AdminCalendarPage`'s pattern.

**Delete confirm:**

- Title: "Delete {className}?"
- Body: if `studentCount > 0`, "This class has {n} students. Move
  or remove them first." with confirm button disabled.
  If `studentCount === 0`, "This action can't be undone." with
  confirm button enabled.
- On success, modal closes, table refetches, success banner appears.

### 5.3 New feature modules

`apps/web/src/features/classes/queries.ts` (additions to existing
file):

```ts
useCreateClass()    // POST /classes;   invalidates classKeys.list
usePatchClass()     // PATCH /classes/:id; invalidates classKeys.list
useDeleteClass()    // DELETE /classes/:id; invalidates classKeys.list
```

`apps/web/src/features/users/queries.ts` (new):

```ts
useEligibleTeachersQuery()  // GET /users?role=teacher; staleTime 60s
```

Both wired via the existing `apiGet`/`apiPost`/`apiPatch`/`apiDelete`
helpers in `services/api/client.ts`.

### 5.4 Navigation

Sidebar entry: `Admin → People → Classes`. Lives between Students
and Register in the existing People section. Route registered in
`apps/web/src/app/routes.tsx`:

```tsx
<Route path="classes" element={<AdminClassesPage />} />
```

### 5.5 i18n

New keys under `admin.classes.*` in `i18n/en.json` and `i18n/ur.json`.
English is the default; Urdu translations are light per project
convention. Keys at minimum:

- `admin.classes.title`, `admin.classes.empty`, `admin.classes.loadError`
- `admin.classes.addCta`, `admin.classes.form.{createTitle,editTitle,nameLabel,teacherLabel,teacherUnavailableSuffix,submit,cancel}`
- `admin.classes.delete.{title,bodyEmpty,bodyHasStudents,confirm,cancel}`
- `admin.classes.errors.{classNameTaken,teacherAlreadyAssigned,teacherNotEligible,classHasStudents,unknown}`

### 5.6 MSW fixtures

`apps/web/src/services/mocks/handlers.ts` gains POST/PATCH/DELETE for
`/classes` and a GET handler for `/users?role=teacher`. The mock
implementations enforce the same uniqueness/error rules as the
backend so tests are realistic. `seed.ts` already creates two
classes with assigned teachers — no change needed.

---

## 6. Edge cases & behaviors

Decisions baked in, with a one-line "what happens" each.

1. **Cross-tenant safety.** Admin from school A `PATCH`es a class
   from school B → 404. Cross-tenant negative test on every write
   endpoint (per project convention — every module has ≥1).
2. **Reassign teacher: outgoing teacher's view.** Outgoing teacher's
   `/me` next call returns `assignedClass: undefined`. Their Teacher
   Today falls into the existing "no class assigned" empty state. No
   notification fires — not in scope.
3. **Reassign target already teaches another class.** Picker hides
   the option as "already teaches X" (disabled `<option>`); the
   service returns `teacherAlreadyAssigned` 409 if a request slips
   through anyway. No auto-move.
4. **Delete a class with historical attendance but no remaining
   student rows.** Proceeds. Once *no* student row (active or
   inactive) points at the class, the FK RESTRICT clears. Historical
   `attendance_records` cascade with their student via
   `students.id` and survive only as long as the student does — that's
   pre-existing behavior, not something this PR changes.
5. **Delete with any student rows attached.** Service counts first
   (active + inactive), returns `classHasStudents` 409 with the
   total `studentCount`. DB error never bubbles. UI surfaces the
   total in the confirm body so the admin sees what blocks them.
6. **Renaming a class.** Just a column update; React Query
   invalidation propagates the new name everywhere on next read.
7. **Race: same name created twice.** Service-level uniqueness check
   is best-effort; both inserts can succeed. Acceptable — not a
   referential bug. Add DB unique later if real schools hit it.
8. **Race: same teacher assigned to two classes.** DB unique on
   `(school_id, teacher_id)` catches the second write. Service
   catches Postgres `23505` and converts to the friendly 409.

---

## 7. Tests

Backend — `apps/api/src/modules/classes/admin-crud.test.ts` (new):

- **Create:**
  - happy path returns 201 + the new class.
  - parent caller → 403.
  - teacher caller → 403.
  - cross-tenant `teacherId` (user in another school) → 400 `teacherNotEligible`.
  - `teacherId` with role=parent → 400 `teacherNotEligible`.
  - duplicate teacher assignment → 409 `teacherAlreadyAssigned`.
  - duplicate name (case-insensitive) → 409 `classNameTaken`.
- **Patch:**
  - happy path, name-only.
  - happy path, teacher-only.
  - happy path, both.
  - empty body → 400 (Zod refine).
  - cross-tenant class id → 404.
  - duplicate teacher assignment → 409.
- **Delete:**
  - happy path on empty class → 200.
  - class with students → 409 `classHasStudents` with `studentCount`.
  - cross-tenant id → 404.

Backend — `apps/api/src/modules/users/users.test.ts` (new):

- lists teachers in caller's school only (cross-tenant negative).
- rejects parent.
- rejects teacher.
- happy path returns `[{ id, fullName }]` sorted by `fullName`.

Frontend — `AdminClassesPage.test.tsx` (new):

- renders rows with name, teacher, student count.
- Add modal: opens; submit calls POST; on success modal closes,
  banner appears.
- Edit modal: preselects current teacher; disables submit when no
  changes; submit calls PATCH.
- Delete modal: shows the right body for `studentCount === 0` vs
  `> 0`; confirm disabled when > 0.
- Picker excludes already-assigned teachers (greyed + disabled) with
  the "(already teaches Grade 3B)" suffix.
- Server-side error path: 409 `teacherAlreadyAssigned` shows the
  inline error in the modal, modal does not close.

No new cross-page integration test — existing Teacher Today and
register tests exercise `cls.teacherId` paths and will catch any
reassignment regression.

---

## 8. Implementation order

Single PR `feat/admin-class-management`. Within the PR, the order
matters because each step is a checkpoint:

1. **Schema + migration.** Drizzle schema change, Postgres migration
   with preflight, `pnpm migrate` runs clean on dev.
2. **Wire schemas.** `createClassRequestSchema`,
   `patchClassRequestSchema`, `teacherPickerListSchema` in
   `@fyntra/schemas`. Bump the package; consumers re-resolve.
3. **Backend writes + list aggregate.** Update `classesRepo.list`
   to `LEFT JOIN students` + `COUNT(*)` so every list row carries
   `studentCount` (active + inactive). Update the existing
   `apps/api/src/modules/classes/classes.test.ts` to assert the new
   field. Add `classesRepo.create/patch/delete/countStudents/findTeacherById/findClassByTeacher`. Then `service.ts`:
   `createClass`, `patchClass`, `deleteClass`. Then `routes.ts` wires
   three new routes. Then `admin-crud.test.ts` — full coverage.
4. **Eligible-teachers endpoint.** New module
   `apps/api/src/modules/users/` (routes/service/repository/test).
   Wired into the Fastify app the same way as existing modules.
5. **Frontend data layer.** Mutations on `features/classes/queries.ts`;
   `features/users/queries.ts` new.
6. **Frontend page.** `AdminClassesPage.tsx` + test. Modals share a
   single form component (`ClassFormFields`) to avoid duplication.
7. **Nav + routing.** Sidebar entry, lazy route.
8. **i18n.** English + light Urdu.
9. **MSW handlers + a green pass of all existing tests.** No
   regressions in the existing test suite is the merge gate.

**Effort:** small-to-medium. About half a day to a day end-to-end,
given the existing patterns to copy from (`AdminCalendarPage`,
`feat/register-lock`).

**No new dependencies.** No new enum extensions. No new cron jobs.
No new notification events.

---

## 9. Explicit out-of-scope

- **Teacher user CRUD.** Adding / editing / deleting teacher users
  themselves. Own feature. The `GET /users?role=teacher` endpoint
  this spec adds is the natural foundation, but the write side is
  not in this PR.
- **Student-to-class roster management.** Moving a student between
  classes, bulk-importing rosters. Already partly addressed by the
  existing admin students filter; a dedicated flow is a follow-up.
- **Soft-delete / archive.** Refused-delete with a student-count
  message is the chosen semantic.
- **Bulk operations.** CSV import of classes, bulk reassign on
  teacher turnover. Not needed for the pilot.
- **Subject / period teachers, room assignments, timetables.** Out
  of band of this product entirely.
- **Multi-teacher classes.** Locked decision — single teacher per
  class. Revisit when a school actually asks for co-teaching.
- **Class detail page (`/admin/classes/:id`).** Deferred. Modal-only
  ships first; add the detail route in a follow-up if/when admins
  ask for a per-class drill-in (roster, register, anomaly history).
- **`/me` returning multiple `assignedClass` rows.** Locked
  decision — DB unique enforces one-class-per-teacher. `/me` stays
  single-`assignedClass`.
