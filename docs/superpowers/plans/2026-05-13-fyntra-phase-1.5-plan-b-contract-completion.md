# Fyntra Phase 1.5 — Plan B: Contract Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Finish the §6 API contract (every endpoint Plan A didn't reach), turn WhatsApp fan-out from dry-run into live template sends, swap the frontend's `useRealtime` from polling to WebSocket, dual-emit the bridge to `POST /readers/tap`, and ship the API README. By the end of this plan, every spec §6 endpoint responds, parents get real WhatsApp messages on whitelisted numbers, the frontend updates in real time, and a tap on the physical ACR122U produces a `tap_events` row in the real DB.

**Architecture:** Mechanical extension of Plan A. Each new module copies the `routes.ts` + `service.ts` + `repository.ts` + `*.test.ts` shape, takes `TenantContext` as first arg in services, filters by `schoolId` first in repos, returns 404 on cross-tenant access, ships ≥1 negative test. The shared `dispatchInAppNotification` helper extracted in Plan A.5 expands to multi-channel (`dispatchNotification`) and WhatsApp lands behind the same call site. `useRealtime` swaps its body without changing consumers — the hook's signature is the swap point.

**Tech Stack:** Same as Plan A. No new deps in the api except `csv-stringify` for attendance CSV export (small, well-supported).

**Spec reference:** `docs/superpowers/specs/2026-05-13-fyntra-phase-1.5-backend-design.md`. This plan implements §15 slices 7–11.

---

## Working conventions (established by Plan A — apply throughout)

- **Tenant filter first.** Every Drizzle `where(and(...))` in a tenant-scoped repo starts with `eq(table.schoolId, ctx.schoolId)`. Cross-tenant 404, never 403.
- **Service signature:** `function name(ctx: TenantContext, ...args)`.
- **Per-module test discipline:** at least one cross-tenant negative test exercising the HTTP layer (admin of school A → 404 when fetching school B resource). Use `app.jwt.sign(...)` to mint tokens in tests.
- **Test isolation:** `apps/api/vitest.config.ts` enforces `singleFork: true` + `fileParallelism: false`. All tests share `fyntra_test` DB; `beforeEach(truncateAll)` clears it.
- **Pool teardown:** only the `auth.e2e.test.ts` file calls `pool.end()` in `afterAll`. New e2e files do NOT call `pool.end()` — vitest drains the process under `singleFork: true`.
- **Commits:** one per task, exact subject per task, no Co-Author trailer, no Claude/AI mention.
- **No barrel files.** Direct imports.
- **Zod schemas** for request bodies/queries come from `@fyntra/schemas` where they exist (§6 contract schemas) — add new ones to that package if the contract grows.
- **Notification fan-out:** call `dispatchInAppNotification(...)` from `apps/api/src/modules/notifications/service.ts`. Slice 8 expands this to `dispatchNotification(...)` covering WhatsApp.

---

## File structure (after Plan B completes)

```
apps/api/src/modules/
├── auth/                  (Plan A)
├── me/                    (Plan A)
├── students/              (Plan A)
├── readers/               (Plan A)
├── attendance/            (Plan A; gains report + CSV in Plan B)
├── tap-events/            (Plan A repo; routes + manual-override land in Plan B)
├── notifications/         (Plan A service helper; routes + repos expand in Plan B)
├── classes/               (NEW, Plan B)
├── cards/                 (NEW, Plan B)
├── devices/               (NEW, Plan B)
└── reports/               (NEW, Plan B — CSV export lives here)

apps/web/src/hooks/useRealtime.ts   (rewritten in slice 9)
apps/bridge/src/index.ts             (dual-emit in slice 10)
apps/api/README.md                   (NEW, slice 11)
```

---

# Slice 7 — Remaining contract endpoints

Module-by-module. Each module is one subagent batch ≈ one commit.

## 7a. Classes module

**Endpoints (per §6):**
- `GET /classes` → `Class[]`
- `GET /classes/:id/attendance?date=` → `{ class: Class, students: Array<{ student: Student, record: AttendanceRecord | null }> }`. Wire shape: open question — pick the simplest array-of-rows envelope and document it. Recommended: `{ classId, date, rows: [{ studentId, fullName, rollNumber, record }] }`.

**Files:**
- `modules/classes/repository.ts` — `list(ctx)`, `findById(ctx, id)`, `attendanceForDay(ctx, classId, ymd)` (joins `students` with `attendance_records` for the given date)
- `modules/classes/service.ts`
- `modules/classes/routes.ts`
- `modules/classes/classes.test.ts` — at minimum: list returns only own school's classes; admin-of-A asking for class-of-B `/classes/:id/attendance` → 404
- Register in `app.ts` after `readerRoutes`

**Tenant edge:** A teacher should only see classes they're assigned to OR all classes in their school? Spec says `/me` returns `assignedClass` for teachers — implying the `/classes` list is admin-grade. Recommend: any authenticated school member can list their school's classes. Document if you decide otherwise.

**Test discipline:** at least one cross-tenant 404 on `/classes/:id/attendance`.

**Commit:** `feat(api): classes list + class attendance-for-day`

## 7b. Cards module (the meaty one)

**Endpoints (per §6):**
- `GET /cards?status=` → `Card[]` (filterable by `cardStatusSchema`)
- `POST /cards/assign` → `Card`. Body `{ cardId, studentId }`. Side effects: write `card_audit_entries` row `action: 'assigned'`. The previous card for that student (if any) stays as-is — only the `students.cardId` analogue is updated via the junction model. NOTE: we don't have a `students.cardId` column; the relationship lives in `cards.studentId`. So this endpoint sets `cards.studentId = studentId` for the given `cardId` and unsets any other active card for that student (status → `replaced` + audit entry).
- `POST /cards/replace` → `Card` (the NEW card). Body `{ studentId, newRfidUid }`. Effects: create a new `cards` row with the new UID, status `active`, `studentId` set. Mark the previously-active card for that student as `replaced` + audit. Audit entries on both: `action: 'replaced'`.
- `PATCH /cards/:id` → `Card`. Body `{ status }` (any of `active | lost | replaced | deactivated`). Effects: update status, append matching audit entry (`lost` / `deactivated` / `reactivated`).
- Wire shape: `Card` includes `auditLog: CardAuditEntry[]` ordered by `at` ASC — pull from `card_audit_entries` and serialize.

**Files:**
- `modules/cards/repository.ts`
- `modules/cards/service.ts` — the three mutation flows are non-trivial; co-locate the audit-write in each
- `modules/cards/routes.ts`
- `modules/cards/cards.test.ts` — minimum 4 tests:
  1. list filtered by status
  2. assign: writes card_audit_entries with action='assigned', replaces previous active card for same student
  3. replace: creates new card, marks old as replaced, both audit entries land
  4. patch: cross-tenant 404 (admin of A patches a card of B → 404)

**Edge case to honor (spec §9):** "Card swapped between students mid-day" gets flagged on the `attendance_records.cardAnomaly` column. That flag is *backend-only* and not exposed on the wire in Plan B — Plan 2 (future) surfaces it. Don't add wire-shape changes for it; just make sure the column gets set when applicable in `recomputeAttendanceForDay` (a TODO comment is acceptable since this is a Phase-2 admin surface).

**Audit-action permission rule:** every mutation passes `ctx.userId` as `card_audit_entries.byUserId`. Use the `requireRole(['admin'])` middleware on all card mutations — only admins can issue/replace/deactivate.

**Commit:** `feat(api): cards CRUD + audit trail + role-gated mutations`

## 7c. Devices module

**Endpoints (per §6):**
- `GET /devices` → `Device[]`
- `GET /devices/:id` → `Device`

**Files:**
- `modules/devices/repository.ts`
- `modules/devices/service.ts`
- `modules/devices/routes.ts`
- `modules/devices/devices.test.ts` — list scoped to school, cross-tenant detail → 404

**Read-only in Plan B.** Device CRUD (issuance, token rotation) is deferred to Phase 2 (admin UI). Plan B is just exposing the existing rows.

**Commit:** `feat(api): devices list + detail`

## 7d. Tap-events history + manual override

**Endpoints (per §6):**
- `GET /tap-events?from=&to=&studentId=` → `TapEvent[]`. The parent home's day-drill calls this scoped to a single day for a single student. Admin uses it to look at the live feed. Recommend: limit results to 500 max per request (no pagination yet), order by `occurredAt DESC`.
- `POST /tap-events/manual` → `TapEvent`. Body `{ studentId, direction, occurredAt, reason }`. Effects:
  - Auth required (admin or teacher of the student's school).
  - Insert a `tap_events` row with `source: 'manual'`, `manualOverrideBy: ctx.userId`, `manualReason: reason`, `cardId: null`, `deviceId`: pick the school's first device (any direction). Document this in a comment — manual taps don't really have a device, but the column is non-null in the schema. Alternative: relax `tap_events.deviceId` to nullable in a follow-up migration. **Recommended: relax to nullable** in a small schema migration first, since "pick the first device" is misleading.
  - Recompute attendance for the day (`recomputeAttendanceForDay`).
  - Fan out `manual_override` notifications to guardians (in-app + WhatsApp once slice 8 lands).
  - Broadcast on WS channels (school + student).

**Files:**
- `modules/tap-events/service.ts` — listing + manual override functions
- `modules/tap-events/routes.ts`
- `modules/tap-events/tap-events.test.ts` — at minimum: cross-tenant list (admin of A asking for studentId from B → empty array, NOT 404, because list endpoints return [] not 404); manual override happy path; manual without reason → 400 (Zod validation).
- Possibly a tiny migration: make `tap_events.device_id` nullable. If you go that route: bump `0001_<name>.sql` via drizzle-kit generate; verify migrate + reset still work.

**Edge cases to honor:**
- Manual override of a date that already had a tap-based record: recompute should incorporate the manual event and flip `isManual: true`. The existing `recomputeAttendanceForDay` already handles this via `taps.some(t => t.source === 'manual')`.
- Manual override notification is a NEW event type for `dispatchInAppNotification`/`dispatchNotification`. Make sure the `event: 'manual_override'` branch is in the `SETTINGS_EVENT_FIELD` map (it already should be — Plan A.5 added all six values).

**Commits:** two commits if you do the schema relax:
1. `chore(api): make tap_events.device_id nullable for manual overrides`
2. `feat(api): tap-events history + manual override with recompute`

Else one commit.

## 7e. Attendance reports + CSV export

**Endpoints (per §6):**
- `GET /attendance?date=&from=&to=&classId=` → `AttendanceRecord[]` (admin filter). Either `date` (single day) OR `from + to` (inclusive range), `classId` optional. Document: if both `date` and `from/to` provided, `date` wins.
- `GET /reports/attendance.csv?from=&to=&classId=` → CSV file. Content-Type `text/csv; charset=utf-8`, Content-Disposition `attachment; filename="attendance_{from}_{to}.csv"`. Columns: `Date, Class, Student, Roll #, Status, First In (Karachi), Last Out (Karachi), Manual`. Use `csv-stringify` (small dep, add to api deps).

**Files:**
- `modules/reports/service.ts` — query builder + CSV stream
- `modules/reports/routes.ts`
- `modules/reports/reports.test.ts` — basic: CSV response sets correct headers, includes seeded rows when present; cross-tenant: admin of A querying with classId of B → 404

**Implementation note:** Use a streaming approach if rows could be large, but for Plan B a single-batch query + `csv-stringify` sync call is acceptable. The reviewer will flag any obvious O(N) hot loops to refactor.

**Time formatting:** `firstInAt` / `lastOutAt` are stored as UTC `timestamptz`. CSV output formats them in Karachi local (use `date-fns-tz` already in the web's deps, but the api doesn't have it — for simplicity, format inline using `+05:00` arithmetic via `lib/time.ts`).

**Commit:** `feat(api): attendance report + CSV export`

## 7f. Notifications log + settings + retry

**Endpoints (per §6):**
- `GET /notifications?userId=&status=` → `NotificationLog[]`. Parent: scoped to their own logs (ignore `userId` param if present). Admin/teacher: omit `userId` to see all school notifications; pass a `userId` to scope.
- `POST /notifications/:id/retry` → `NotificationLog`. Admin/teacher only. Re-sends the underlying message via the original channel, flips status to `sent` and refreshes `sentAt`. For Plan B with WhatsApp live, this actually calls `sendTemplate` again. The original row is updated in place.
- `GET /notifications/settings` → `NotificationSettings`. Auto-create defaults on first read (per spec §13 lock-in). Parent default: `device_offline=false`. Admin/teacher default: all true.
- `PATCH /notifications/settings` → `NotificationSettings`. Body shape per `notificationSettingsSchema` from `@fyntra/schemas`. Parent UI hides `device_offline` (decided in spec); the backend rejects parents sending `events.device_offline: true` with a 400 — OR silently coerces to false. **Recommended: silent coerce + log a warning**, since the frontend may send the full shape from settings state. Document the choice.

**Files:**
- `modules/notifications/repository.ts` — extend (already exists from Plan A) with `findSettingsForUserAutoCreate(ctx)`, `updateSettings(ctx, patch)`, `listLogs(ctx, filters)`, `findLog(ctx, id)`, `markLogResent(ctx, id, status, sentAt)`
- `modules/notifications/service.ts` — extend (already exists) with `getMySettings(ctx)`, `updateMySettings(ctx, patch)`, `listNotifications(ctx, filters)`, `retryNotification(ctx, id)`
- `modules/notifications/routes.ts` — NEW file
- `modules/notifications/notifications.test.ts` — minimum 4 tests:
  1. settings auto-create on first GET
  2. parent's device_offline=true gets coerced to false
  3. list scoped to caller's school
  4. cross-tenant retry → 404 (admin of A retries a log of B)

**Commit:** `feat(api): notifications log + settings + retry`

## 7g. Student timeline

**Endpoint:** `GET /students/:id/timeline?from=&to=` → `AttendanceRecord[]`. Parent's calendar view + admin's student-detail. Tenant filter applies; parent can only see their own children (verify via `student_guardians`).

**Files:**
- Extend `modules/students/repository.ts` with `timelineForStudent(ctx, studentId, from, to)`
- Extend `modules/students/service.ts` + `routes.ts`
- Extend `modules/students/students.test.ts` — cross-tenant negative + happy path

**Commit:** `feat(api): student timeline endpoint for parent calendar`

---

# Slice 8 — WhatsApp template fan-out (live)

Turns `dispatchInAppNotification` into multi-channel. WhatsApp templates are registered in Meta Business Manager before deploy; for dev with a testing account, only whitelisted recipients receive messages.

## 8a. Templates registered in Meta

The user is responsible for registering these templates in Meta Business Manager. List them in the api README. For Plan B, code against these template names:

- `fyntra_otp` — variable `{{1}}` is the 4-digit code. Already used by Plan A's auth (`requestOtp`).
- `fyntra_tap_event` — variables `{{1}}` = child name, `{{2}}` = time string (HH:MM Karachi local).
- `fyntra_absent` — variables `{{1}}` = child name, `{{2}}` = date (e.g., "Wed 13 May").

Plan B does NOT block on template approval. The code can be merged with the templates registered as a prereq for `WHATSAPP_DRY_RUN=false`.

## 8b. Multi-channel dispatch

Rename `dispatchInAppNotification` to `dispatch` (keep an alias if anyone outside the module imports the old name — at the moment, only the two callers we extracted in Plan A.5). The new signature:

```ts
export interface DispatchInput {
  schoolId: string
  recipientUserId: string
  event: NotificationEvent
  // The full set of per-channel payloads. Settings gate which channels actually fire.
  payloads: {
    inApp?: { title: string; body: string }
    whatsapp?: { templateName: string; variables: string[] }
    sms?: { body: string }  // logged as failed for now; no provider wired
  }
  eventId?: string | null
  recipientPhone: string  // needed for whatsapp; fetched once at call site
}

// Returns count of channels actually fired.
export async function dispatch(input: DispatchInput): Promise<number>
```

Per the spec: WhatsApp goes via `sendTemplate(...)` from `services/whatsapp.ts`. Log row records `status` based on the `SendResult` from sendTemplate (`sent` or `failed` with `errorMessage`).

**Both call sites change to provide both payloads:**

- `ingestTap` → `payloads.inApp = { title: 'Arrived at school', body: 'Tap at HH:MM' }`, `payloads.whatsapp = { templateName: 'fyntra_tap_event', variables: [childFullName, hhmmKarachi] }`. Lookup the recipient's `phone` once before the loop OR pass through the existing guardian-rows query (extend it to include `users.phone`).
- `runAbsentJobForSchool` → similar; `payloads.whatsapp = { templateName: 'fyntra_absent', variables: [childFullName, dateString] }`.

**Files:**
- `modules/notifications/service.ts` — extend `dispatch` from the existing helper
- `modules/readers/service.ts` — call new `dispatch`
- `services/attendance-jobs.ts` — call new `dispatch`
- Tests: extend `readers/service.test.ts` to assert that with `WHATSAPP_DRY_RUN=true` AND `settings.whatsapp = true`, the notification_logs row count goes up by 2 (one in_app, one whatsapp). Same for absent-job test.

**Important:** keep `WHATSAPP_DRY_RUN=true` in `tests/setup-env.ts`. Tests should never make a live WhatsApp call. The dry-run path still inserts a `notification_logs` row with `status: 'sent'` and a marker (e.g., `payload.errorMessage` left undefined, but distinguishable from a true live success — or just `payload.dryRun: true`).

**Commit:** `feat(api): multi-channel notification dispatch with whatsapp templates`

## 8c. Real WhatsApp test (manual, not automated)

After the multi-channel landing, the user adds a real phone number to the WhatsApp testing-account whitelist, sets `WHATSAPP_DRY_RUN=false` in their local `.env`, restarts the api, and curls a tap with their child's rfidUid. They should receive a `fyntra_tap_event` template message on the whitelisted phone within a few seconds.

This step is in the README (slice 11) as a manual walkthrough.

**No commit for this step** — it's a verification, not code.

---

# Slice 9 — Frontend WebSocket cutover

Replace the body of `apps/web/src/hooks/useRealtime.ts` to subscribe via WS instead of polling. Consumers don't change.

## 9a. WS client + reconnect

**Files:**
- `apps/web/src/hooks/useRealtime.ts` — full rewrite
- `apps/web/src/hooks/useRealtime.test.ts` — extend existing tests; mock the WebSocket constructor

**Behavior:**
- On mount: open `new WebSocket(\`${baseWsUrl()}/ws?token=${token}\`)` where `baseWsUrl()` derives from `VITE_API_BASE_URL` (replace `http://` with `ws://`, `https://` with `wss://`).
- On message: parse JSON, dispatch through whatever the existing hook's consumer API is (probably a React Query `invalidate` call or a callback).
- On close: backoff reconnect (1s, 2s, 5s, capped at 10s, jittered).
- On unmount: close the socket.
- The hook returns the same shape it did before — consumers (parent home, admin live feed) don't change.
- Active-window guard from Plan 1 (`[startTime-30m, endTime+30m]`) is no longer needed since WS doesn't poll. Remove it if it still exists in the hook.
- Tab visibility guard: also no longer needed. WS stays open even when tab is backgrounded.

**Tests:**
- New test: hook opens a WS to the configured URL, fires the right invalidation when a `tap` message arrives. Use vitest's `vi.stubGlobal('WebSocket', MockWS)`.
- Existing tests probably mocked timers for polling — remove or rewrite.

**Commit:** `refactor(web): useRealtime swaps polling for WebSocket`

## 9b. Verify end-to-end

Manual: start api + web dev servers, log in as parent, open the parent home, curl a tap. The home should reflect within ~100ms (WS push), not 15 seconds (old polling).

**No commit for the verification.**

---

# Slice 10 — Bridge dual-emit

`apps/bridge/` currently broadcasts taps to a localhost-only WebSocket consumed by the Simulate Tap page. Plan B keeps the WS broadcast (so the dev Simulate Tap UI still works) AND adds a `POST /readers/tap` HTTPS call to the api with a seeded device token.

## 10a. Bridge env + HTTPS call

**Files:**
- `apps/bridge/src/index.ts` — extend
- `apps/bridge/.env.example` — new file
- `apps/bridge/README.md` — update with the dual-emit explanation

**New env vars (read at bridge startup):**
- `FYNTRA_API_URL` — e.g. `http://localhost:3000`
- `FYNTRA_DEVICE_TOKEN` — one of the plaintext device tokens printed by `db:seed`
- `FYNTRA_DEVICE_DIRECTION` — `in` | `out` | `both` (default `both`; for `both`, the bridge defaults to `in` per tap since the reader can't disambiguate — Plan 2 picks this up)

**Behavior:**
On every `card_tapped` event (already wired):
1. Broadcast on the local WS as today (unchanged) — keeps the Simulate Tap page working.
2. Additionally POST to `${FYNTRA_API_URL}/readers/tap` with body `{ rfidUid, direction, occurredAt, deviceToken }`. Default `direction` to `in` for now; the user can flip via env if the reader is at an exit gate.

If the api is down or rejects, log the error to stderr but don't crash — the WS broadcast already succeeded.

**Commit:** `feat(bridge): dual-emit tap events to api over HTTPS`

## 10b. Bridge README updates

Document:
- The two env vars
- How to get a device token (re-run `pnpm -F api db:seed` and capture stdout, OR query `device_tokens` for the hash and re-issue if you've lost the plaintext — Phase 2 admin UI fixes this)
- The "set DEVICE_DIRECTION based on which gate the reader is at" caveat

**Commit:** `docs(bridge): dual-emit env + setup`

(Or fold into 10a if the README change is just a few lines.)

---

# Slice 11 — API README

Single file, `apps/api/README.md`. No tests.

## Sections to include

1. **Quick start** — `pnpm install`, `docker compose up -d`, `cp .env.example .env`, `pnpm -F api db:migrate`, `pnpm -F api db:seed`, `pnpm -F api dev`.
2. **Env vars** — Every var in `.env.example` with a one-liner. Special call-outs:
   - `JWT_SECRET` / `READER_TOKEN_SECRET`: `openssl rand -base64 32`
   - `WHATSAPP_*`: placeholder by default; flip `WHATSAPP_DRY_RUN=false` only after templates are approved.
3. **WhatsApp setup** — Step-by-step:
   - Register the three templates (`fyntra_otp`, `fyntra_tap_event`, `fyntra_absent`) in Meta Business Manager.
   - Add whitelisted recipient phones in Meta's UI.
   - Paste real `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_BUSINESS_ACCOUNT_ID`, `WHATSAPP_APP_SECRET` into `.env`.
   - Set `WHATSAPP_DRY_RUN=false`. Restart.
4. **Scripts**:
   - `pnpm -F api dev` / `build` / `start`
   - `pnpm -F api typecheck` / `lint` / `test`
   - `pnpm -F api db:generate` / `db:migrate` / `db:seed` / `CONFIRM=yes db:reset`
5. **Architecture overview** — One paragraph linking to the spec. Mention module structure, tenant pattern, in-memory broker, node-cron jobs.
6. **Troubleshooting**:
   - Port 3000 in use → `PORT=3030 pnpm -F api dev`
   - "relation does not exist" after `db:reset` → known: `db:reset` drops both `public` and `drizzle` schemas; if it still fails, restart Docker.
   - WS connection 4001 → JWT expired or signed with a different `JWT_SECRET`. Rotate or re-login.
   - WhatsApp 400/403 → check the recipient is in the whitelist, check the access token isn't expired.
7. **Phase 2 hooks** — A short list of "deferred" items (push notifications, multi-school super-admin, etc.) so future maintainers know where the boundary is.

**Commit:** `docs(api): README — setup, env, whatsapp, troubleshooting`

---

# Verification matrix (run before tagging Plan B done)

```
pnpm -r typecheck                              # all packages strict
pnpm -F api test                                # count rises from 32 (Plan A.5) to ≈50+ with all new modules
pnpm -F web typecheck && pnpm -F web lint && pnpm -F web test
pnpm -F bridge build
curl-driven smoke:
  - /classes returns the seeded 4 classes
  - /cards?status=active returns 60 cards
  - /devices returns 2 devices
  - /tap-events?from=...&to=... returns recent events
  - /reports/attendance.csv?from=...&to=... returns a CSV file
  - /notifications?... returns logs scoped to caller
  - WhatsApp live: a real message lands on a whitelisted phone (manual)
  - WS: wscat receives a tap event in real time
  - Bridge dual-emit: tapping a physical card produces both a Simulate-Tap-page event AND a real DB row
```

# Tag at end

```bash
git tag -a v1.5-complete -m "Phase 1.5 complete: full §6 contract, live WhatsApp, WS realtime, bridge dual-emit"
```

---

# Recommended execution order

The order matters because of dependencies:

1. **7a — classes** (small, warms up the pattern)
2. **7c — devices** (small, read-only)
3. **7g — student timeline** (extends existing module)
4. **7b — cards** (audit log, role gates)
5. **7d — tap-events + manual override** (touches the recompute path)
6. **7e — attendance reports + CSV** (needs the data from 7d's manual events to be interesting)
7. **7f — notifications log + settings + retry** (needs 8 for retry-via-WhatsApp to be live; can be done before 8 as in-app-only retry)
8. **Slice 8 — multi-channel dispatch + WhatsApp** (touches notifications module just built)
9. **Slice 9 — frontend WS** (independent of 7–8)
10. **Slice 10 — bridge dual-emit** (after 7d so the manual override path is stable)
11. **Slice 11 — README** (last, captures everything learned)

Parallelizable: 9 (frontend) can land any time after Plan A; it doesn't depend on 7–8.

---

# Plan-B-defined out of scope

- Push notifications (still Phase 2)
- Multi-school super-admin
- Card-anomaly UI surface (the `cardAnomaly` boolean stays backend-only)
- Device admin (token issuance/rotation through API — Phase 2 admin UI)
- SMS provider integration (rows logged as failed)
- Urdu WhatsApp templates
- Reports beyond attendance (per-class stats, trend charts, etc.)
- Pagination on list endpoints (still array-only)
