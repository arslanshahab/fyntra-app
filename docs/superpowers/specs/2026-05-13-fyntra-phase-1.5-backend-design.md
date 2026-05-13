# Fyntra — Phase 1.5 backend design

**Date:** 2026-05-13
**Status:** Approved for implementation planning
**Source-of-truth context:** `README.md` (the existing one at repo root) — §5 data model, §6 API contract, §9 edge cases, §14 Phase 1.5 handoff brief. This document **does not duplicate** those sections; it locks the decisions left open by them.

---

## 1. Goal and non-goals

### Goal
Stand up a Node + Fastify + Postgres backend that satisfies the §6 API contract byte-for-byte, owns the §9 edge-case business logic, and replaces both the MSW mock and the `bridge/`'s role as the tap-ingestion path. The Phase 1 frontend changes only in env, MSW toggle, and the `useRealtime` swap.

### Non-goals (deferred)
Real hosting, hardening, multi-region, secrets management beyond `.env*`, push notifications, multi-school super-admin, bus tracking, authorized-pickup verification, visitor management, fees, homework, Urdu notification templates, BullMQ/Redis, multi-instance Fastify, observability beyond Pino. None of these are touched in this spec or the resulting plan.

---

## 2. Repository structure (after the Step 0 migration)

```
fyntra/
├── package.json                 # { "private": true } workspace root
├── pnpm-workspace.yaml          # apps/* and packages/*
├── tsconfig.base.json           # shared compiler options
├── apps/
│   ├── web/                     # existing frontend, git mv'd from root
│   ├── api/                     # NEW — Fastify backend
│   └── bridge/                  # existing bridge, git mv'd from /bridge
├── packages/
│   └── schemas/                 # NEW — @fyntra/schemas, TS-source-only
└── docs/superpowers/specs/      # this doc lives here
```

### `@fyntra/schemas` shape

```jsonc
// packages/schemas/package.json
{
  "name": "@fyntra/schemas",
  "private": true,
  "type": "module",
  "exports": { ".": "./src/index.ts" },
  "types": "./src/index.ts",
  "dependencies": { "zod": "^3.25.0" }
}
```

No build step. `apps/web` (Vite) and `apps/api` (tsx/tsc) both consume `.ts` directly. The frontend's `src/types/schemas.ts` becomes `packages/schemas/src/index.ts` (moved verbatim in the migration commit, then frontend imports get rewritten in a follow-up commit so blame stays clean).

### Migration commit discipline
- Delete the two stale `package-lock.json` files (root + `bridge/`).
- Regenerate `pnpm-lock.yaml` at the workspace root.
- Use `git mv` to preserve history for every moved file.
- Migration commit subject: `chore: restructure into pnpm monorepo for phase 1.5`.
- Follow-up commit: `refactor(web): import schemas from @fyntra/schemas`.
- Acceptance: `pnpm -F web build`, `lint`, `typecheck`, `test` all green; `pnpm -F bridge build` green.

---

## 3. Stack (apps/api)

| Concern | Choice |
|---|---|
| Runtime | Node 20+ pinned in `.nvmrc` |
| Framework | Fastify v5 |
| Type provider | `fastify-type-provider-zod` |
| Auth (user) | `@fastify/jwt`, HS256, 30-day expiry |
| Auth (reader) | Long-lived opaque token, separate secret `READER_TOKEN_SECRET` |
| ORM | Drizzle ORM + drizzle-kit |
| Database | Postgres 16 via `apps/api/docker-compose.yml`, named volume |
| Realtime | `@fastify/websocket`, in-memory pub/sub |
| Rate limit | `@fastify/rate-limit` |
| CORS | `@fastify/cors` |
| Logging | Pino, `pino-pretty` in dev, JSON in prod |
| Scheduler | `node-cron` (in-process) |
| WhatsApp | Direct HTTPS to `graph.facebook.com`, no SDK |
| Tests | `vitest` + `supertest` |
| IDs | `uuid` v9+ in v7 mode (monotonic) |
| Request ID | `nanoid`, returned as `X-Request-Id` |

Out: BullMQ, Redis, OpenAPI generators, ts-rest, NestJS, Prisma, Sentry, OpenTelemetry.

---

## 4. Project layout (apps/api)

```
apps/api/
├── package.json
├── tsconfig.json
├── drizzle.config.ts
├── docker-compose.yml          # Postgres only
├── .env.example
├── .nvmrc
├── README.md                   # setup + env vars + troubleshooting
├── src/
│   ├── server.ts               # Fastify bootstrap + plugin registration
│   ├── config/
│   │   └── env.ts              # Zod-parsed, fail-fast on missing vars
│   ├── db/
│   │   ├── client.ts
│   │   ├── schema/             # one file per logical group (see §5)
│   │   ├── migrations/         # drizzle-kit generated, checked in
│   │   └── seed.ts             # mirrors MSW seed exactly
│   ├── middleware/
│   │   ├── require-auth.ts
│   │   ├── require-role.ts
│   │   ├── tenant-context.ts   # request decorator
│   │   └── request-logging.ts
│   ├── modules/
│   │   ├── auth/
│   │   ├── students/
│   │   ├── classes/
│   │   ├── cards/
│   │   ├── devices/
│   │   ├── attendance/
│   │   ├── tap-events/
│   │   ├── readers/
│   │   ├── reports/
│   │   └── notifications/
│   ├── services/
│   │   ├── whatsapp.ts         # Cloud API client + template senders
│   │   ├── realtime.ts         # in-memory pub/sub for WS
│   │   ├── attendance-jobs.ts  # node-cron schedules
│   │   └── heartbeat-sweep.ts  # device offline detection
│   ├── lib/
│   │   ├── logger.ts
│   │   ├── errors.ts
│   │   └── ids.ts              # uuid v7 helper
│   └── types/
└── tests/
```

Each `modules/<name>/` has `routes.ts`, `service.ts`, `repository.ts`, and at least one `*.test.ts` including one tenant-isolation negative test. No barrel files.

---

## 5. Data model (locks open decisions from README §5)

Every table has `id uuid` (v7 PK), `createdAt timestamptz`, `updatedAt timestamptz`, and `schoolId uuid` where applicable. Tenant index = composite `(schoolId, id)` on every tenant-scoped table.

### Tables (split by file)

- **`schema/auth.ts`** — `users`, `otp_codes`
- **`schema/schools.ts`** — `schools`, `classes`
- **`schema/students.ts`** — `students`, `student_guardians`
- **`schema/cards.ts`** — `cards`, `card_audit_entries`
- **`schema/devices.ts`** — `devices`, `device_tokens`
- **`schema/attendance.ts`** — `tap_events`, `attendance_records`
- **`schema/notifications.ts`** — `notification_logs`, `notification_settings`

### Decisions locked

| Decision | Choice |
|---|---|
| Card audit log | Separate `card_audit_entries` table; carries denormalized `schoolId` for tenant scoping; FK to `cards.id`. |
| Student↔Guardian | Explicit junction `student_guardians (studentId, userId, schoolId, relationship?, createdAt)`. `relationship` is a nullable enum `father \| mother \| guardian \| driver \| other`. The `guardianIds: ID[]` on the wire is derived. |
| `NotificationSettings` | Singleton per user. Table keyed by `(userId)` PK, with `schoolId` denormalized. Auto-created with role-appropriate defaults on first `GET /notifications/settings`. No 404. |
| Soft delete | `deletedAt timestamptz` on `cards` and `devices` only. Students use the existing `status` enum (`active \| inactive`). Users hard-delete (rare; no UI for it in Phase 1.5). Other tables hard-delete. |
| UUIDs | v7 generated at app layer via the `uuid` npm package (≥ v9). |
| Device tokens | Stored hashed (`sha256`) in `device_tokens(deviceId, tokenHash, label, createdAt, revokedAt)`. Plaintext token is 32-byte URL-safe random (high entropy → sha256 without per-row salt is safe; no offline dictionary risk on this kind of opaque token). Plaintext printed once at seed time to console for the dev seed. |

### `NotificationSettings` defaults

| Role | channels.whatsapp | channels.sms | channels.in_app | events |
|---|---|---|---|---|
| parent | true | false | true | `tap_in: true, tap_out: true, late: true, absent: true, manual_override: true, device_offline: false (hidden in UI)` |
| admin | true | false | true | all true |
| teacher | true | false | true | all true |

`device_offline` setting exists in the DB for all users but is hidden from the parent UI; the parent never receives device-offline notifications regardless of the value.

### Wire-shape notes

- `Student.guardianIds` is computed from `student_guardians` at serialization time.
- `Card.auditLog` in `GET /students/:id` / card responses is hydrated from `card_audit_entries` (ordered ASC by `at`).
- `NotificationSettings` on the wire has no `id` or `userId` — matches the existing Zod schema.

---

## 6. Multi-tenancy

`TenantContext`:

```ts
interface TenantContext {
  schoolId: string;
  userId: string;
  role: 'parent' | 'admin' | 'teacher';
}
```

- Populated by `require-auth` from the JWT, attached to `request.tenantContext` via Fastify decorator.
- Every service function takes `ctx: TenantContext` as **first** arg.
- Every repository query has `eq(table.schoolId, ctx.schoolId)` as the **first** `WHERE` predicate.
- Cross-tenant resource access → **404** (hide existence), not 403.
- Each module ships **at least one** cross-tenant negative test: "admin of school A receives 404 (not data) when fetching a school B resource."

The reader-ingestion endpoint is the only path where tenant context is derived from the **device token** rather than a JWT: device → `schoolId` → context.

---

## 7. Auth and OTP

### Flow

1. `POST /auth/request-otp { phone }` → generate 4-digit code (cryptographically random), hash with sha256 + per-row salt, store in `otp_codes(phone, codeHash, salt, expiresAt, attempts, consumedAt)`. Expiry = 5 min. Send via WhatsApp template `fyntra_otp` with `{{1}}` = code. Returns `{ ok: true }` whether or not the phone matches a user (no enumeration leak).
2. `POST /auth/verify-otp { phone, otp }` → load latest non-consumed unexpired row for phone; compare hash; on success mark consumed, mint JWT, return `{ token, user }`. On failure, increment `attempts`; if `attempts >= 3`, mark consumed. Single-use even on success.
3. `GET /me` → returns `{ user, school, children?, assignedClass? }`. `children` iff role=parent, `assignedClass` iff role=teacher. Admins get only `user` + `school`.

### Rate limits

| Endpoint | Limit |
|---|---|
| `POST /auth/request-otp` | 5 / hour / phone |
| `POST /auth/verify-otp` | 10 / 15 min / IP |
| Global | 100 / min / IP |

Keys for the per-phone limit are the normalized E.164 phone. Per-IP limits use `x-forwarded-for` first hop if present, else socket IP.

### JWT

- HS256, 30-day expiry, secret from `JWT_SECRET` env.
- Payload: `{ userId, schoolId, role }`. No claims beyond standard `iat`/`exp`.
- `.env.example` includes `# Generate with: openssl rand -base64 32`.

---

## 8. WhatsApp integration

### Approach
Direct HTTPS to `graph.facebook.com/v22.0` (or whatever current version is at implementation time). No SDK. One `services/whatsapp.ts` module exposes `sendTemplate({ to, name, languageCode, variables })` and `sendText({ to, body })` (the latter only usable inside the 24h service window).

### Templates (registered in Meta Business Manager before deploy)

| Template | Purpose | Variables | Language |
|---|---|---|---|
| `fyntra_otp` | OTP delivery | `{{1}}` = code | `en` |
| `fyntra_tap_event` | Tap in/out notification | `{{1}}` = child name, `{{2}}` = time string | `en` |

Urdu variants deferred to Phase 2.

### Credentials
`.env` holds `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_BUSINESS_ACCOUNT_ID`, `WHATSAPP_APP_SECRET`. `.env.example` ships **placeholder values** — real credentials provided at deploy time, swapped in via env without code changes.

### Whitelist gotcha
Testing accounts can only message phones explicitly added in Meta's UI. The seed will populate `users.phone` for all 60 parents, but **only the few whitelisted real numbers will actually receive messages**. `NotificationLog` rows are still created for all non-whitelisted attempts; the WhatsApp API call records its failure on the row's `status` and `payload.errorMessage`. Non-blocking.

### Phase 1.6 carve-out
Real SMS provider integration is deferred. SMS channel calls write a `NotificationLog` row with status `failed` and `payload.body` set, but make no network call.

---

## 9. Reader ingestion

### `POST /readers/tap`
- Auth: `deviceToken` field in body (matches the contract in the handoff prompt). The plaintext token is checked against `device_tokens.tokenHash`.
- Body: `{ rfidUid, direction, occurredAt, deviceToken }`.
- Flow:
  1. Resolve device → `schoolId`. Reject if revoked.
  2. Resolve `cards.rfidUid` within school. If no active card matches, persist a `tap_events` row with `cardId = null` and an audit-style error, return 404.
  3. Dedupe: same `(rfidUid, deviceId, direction)` within 30s → return 200 with `{ deduplicated: true }` and do not fan out.
  4. Persist `tap_events` row.
  5. Compute/update `attendance_records` for `(studentId, date)` — see §11.
  6. Fan out (§12).
  7. Broadcast on WS (§10).

### `POST /readers/heartbeat`
- Auth: same device token.
- Body: `{ occurredAt }`.
- Updates `devices.lastHeartbeat` and flips `status` to `online` if it was `offline`.

### Heartbeat thresholds
- Reader emits heartbeat every **60 seconds**.
- A background sweep (`services/heartbeat-sweep.ts`, `node-cron` every 30s) marks any device `offline` whose `lastHeartbeat < now() - 180s` (i.e. 3 missed heartbeats).
- Status transition `online → offline` does not itself emit a tap event; it does emit a `device_offline` in-app notification to admins/teachers per their settings, and a WS message on `tap-events:school/<schoolId>`.

### Dev seed
2 devices, both `direction: 'both'`, both with hardcoded plaintext tokens printed at seed completion. README has `curl` examples copy-pasted from the seed output.

---

## 10. Realtime (WebSocket)

### Server
- `@fastify/websocket`. Route: `GET /ws`.
- Auth via **query param** `?token=<jwt>` on upgrade. On invalid/expired → close with code 4001.
- Pino serializer scrubs `token` from query-string log fields.

### Channels
- `tap-events:school/<schoolId>` — subscribed by admins/teachers of that school.
- `tap-events:student/<studentId>` — subscribed by guardians of that student.

### Subscription policy
On connect:
- role=parent → subscribed to one channel per child in `student_guardians`.
- role=admin → subscribed to their school channel.
- role=teacher → subscribed to their school channel (not just their class — admin-grade visibility is fine for now; frontend filters by class where needed).

### Broadcast payloads
- `tap` — full `TapEvent` plus `student: { id, fullName }` for display.
- `attendance_changed` — `{ studentId, record: AttendanceRecord }` when a record's status flips.
- `device_status` — `{ deviceId, status, lastHeartbeat }`.

In-memory pub/sub. Single Fastify instance — locked, no cluster. If horizontal scale ever becomes needed, swap to Redis pub/sub; that's Phase 2.

---

## 11. Attendance computation (the meaty one)

### Record lifecycle (option (a): lazy + scheduled backfill)

1. **First tap-in of the day for a student** → create `attendance_records(studentId, date, firstInAt=occurredAt, status=present|late, isManual=false)`. Status = `late` if `occurredAt - school.startTime > lateThresholdMinutes`, else `present`.
2. **Subsequent tap-in** → update `firstInAt` only if earlier than current (clock-skew defense).
3. **Tap-out** → update `lastOutAt` to the latest seen value. If `lastOutAt < school.endTime`, status flips to `left_early` (unless already `late`, in which case status remains `late` — late beats left_early).
4. **Manual override (`POST /tap-events/manual`)** → insert `tap_events` with `source=manual`, `manualOverrideBy`, `manualReason`. Recompute record. Set `isManual=true` and keep it true permanently.

### Absent scheduling

- A `node-cron` job per school is scheduled at **`school.startTime + absentThresholdMinutes` in `Asia/Karachi`** every weekday.
- The job:
  1. Finds active students with no `attendance_records` row for today.
  2. For each, checks whether the **relevant** gate device(s) for the school are `online` at job time.
  3. If all relevant devices are offline → insert record with status `unverified`, **do not fan out**.
  4. Else → insert record with status `absent`, **fan out the `absent` notification** to guardians per their settings.

"Relevant device" for Phase 1.5: any device in the school with `direction in ('in', 'both')`. Suppression applies if **all** such devices are offline at job time.

### Tap edge cases (§9 ownership)

| Case | Implementation |
|---|---|
| 30s same-direction same-card | Dedupe — log only, no record change. |
| Tap-in without tap-out by EOD | An EOD `node-cron` job (school's `endTime + 60min`) sets a `leftWithoutScan: true` flag on records with `firstInAt` but no `lastOutAt`. **Backend-only column** — not on wire in Phase 1.5; Phase 2 admin UI consumes it. |
| Card swapped mid-day | Detected when a tap event references a card whose `studentId` differs from the day's existing record's student. Record flags `cardAnomaly: true`. **Backend-only column** — Phase 2 admin UI shows the warning. |
| 60s in→out same card | Insert both events; mark `flaggedForReview: true` on the record. **Backend-only column** — Phase 2 admin UI surfaces. |
| No card assigned yet | The scheduled absent job skips any student with no currently-active `cards` row (i.e. no row where `cards.studentId = student.id AND cards.status = 'active' AND cards.deletedAt IS NULL`). The student simply has no `attendance_records` row for the day; frontend renders that as "card not assigned." |

### Recomputation guarantees
Every tap (real or manual) recomputes the day's record from scratch by replaying all events for that `(studentId, date)`. This makes manual overrides idempotent and the audit trail authoritative.

---

## 12. Notification fan-out

On every persisted tap event (and on `absent` job firings, and on `device_offline` transitions):

1. Determine event type: `tap_in | tap_out | late | absent | manual_override | device_offline`.
2. Determine recipients:
   - `tap_in/tap_out/late/absent/manual_override` → student's guardians.
   - `manual_override` → also admins/teachers of the school.
   - `device_offline` → admins/teachers of the school. **Never parents.**
3. For each recipient, load `notification_settings`.
4. For each enabled channel for that event:
   - `whatsapp` → call `whatsapp.sendTemplate(...)`; persist `notification_logs` row with `queued` then transition to `sent` or `failed`.
   - `in_app` → persist `notification_logs` row with `status='sent'`, broadcast on WS to the recipient's channels.
   - `sms` → persist `notification_logs` row with `status='failed'`, `payload.errorMessage='sms_provider_not_configured'`. No network call.

### Retry
`POST /notifications/:id/retry` (admin/teacher only) re-sends the underlying message via the original channel, flipping status to `sent` on success. The original row is updated in place (`sentAt` refreshed); no new row.

---

## 13. API contract diffs vs README §6

The contract is implemented byte-for-byte from §6 with these explicit lock-ins:

- **List endpoints** (`/students`, `/tap-events`, `/notifications`, `/attendance`, `/cards`, `/devices`, `/classes`) return **arrays**, not envelopes. Pagination deferred to Phase 1.6.
- **Error response**: Fastify default `{ statusCode, error, message }`, augmented with `requestId` field, and `X-Request-Id` response header on every response.
- **Cross-tenant**: 404 with the same body shape as "not found."
- **`GET /notifications/settings`**: never 404. Auto-create defaults on first read.
- **`POST /dev/simulate-tap`**: **not implemented** in Phase 1.5. The frontend's Simulate Tap page will be repointed at `POST /readers/tap` with a seeded device token in the bridge dual-emit step.

### New endpoints introduced in Phase 1.5

| Endpoint | Auth | Purpose |
|---|---|---|
| `POST /readers/tap` | Device token | Reader ingestion (§9) |
| `POST /readers/heartbeat` | Device token | Reader liveness (§9) |
| `GET /ws` | JWT (query param) | WebSocket realtime (§10) |
| `GET /health` | None | Liveness probe |

---

## 14. Observability

- Pino root logger with `pino-pretty` transport in dev (NODE_ENV=development), JSON transport in prod.
- Request middleware logs on **completion** with `{ requestId, userId?, schoolId?, role?, method, path, statusCode, durationMs }`.
- `nanoid` for `requestId`, length 10. Exposed as `X-Request-Id` response header.
- Error logs include full stack + serialized request (with `Authorization` header redacted and WS `token` query-param redacted).
- No Sentry, no APM, no OTel.

---

## 15. Build sequence

| # | Slice | Deliverable | Done-when |
|---|---|---|---|
| 0 | Monorepo migration | pnpm workspace, web + bridge moved, `@fyntra/schemas` extracted, follow-up commit rewrites web imports | `pnpm -F web build/lint/typecheck/test` green; bridge runs |
| 1 | API scaffold | Fastify + Pino + Zod provider + env config + Drizzle wired + Postgres docker-compose + `GET /health` | `curl localhost:3000/health` returns 200 |
| 2 | Schema migrations + seed | All tables; seed mirrors MSW (1 school, 4 classes, 60 students, 60 parents, 2 devices, 3 admins, 4 teachers, 2 device tokens) | `pnpm db:reset` succeeds; seed prints device tokens |
| 3 | Auth slice | `/auth/request-otp` + `/auth/verify-otp` + `/me` + `require-auth` + tenant decorator + WhatsApp OTP | Curl on a whitelisted number receives OTP, verifies, gets JWT, hits `/me` |
| 4 | First CRUD: `/students` | List + detail + cross-tenant negative test | Vitest green incl. tenant test |
| 5 | Tap ingestion E2E | `/readers/tap` + `/readers/heartbeat` + attendance compute + absent scheduler + in-app log + WS broadcast | Curl-triggered tap creates record + WS message + in-app log |
| 6 | Frontend cutover (REST only) | `VITE_API_BASE_URL` + `VITE_USE_MOCKS=false`; polling-only `useRealtime` still in place | Parent home reflects a curl-triggered tap via polling |
| 7 | Rest of contract | classes, cards (+ audit), devices (+ heartbeat detail), tap-events history, attendance reports + CSV, notifications log + settings, manual override | All §6 endpoints respond per Zod schemas; tenant tests per module |
| 8 | WhatsApp fan-out | `fyntra_tap_event` template wired, real send to whitelisted number, log status transitions | A real WhatsApp message lands in a real phone |
| 9 | Frontend WS cutover | `useRealtime` body swapped to WS client | Cross-tab desync gone; parent home updates instantly |
| 10 | Bridge dual-emit | `apps/bridge` keeps WS for Simulate Tap; adds `POST /readers/tap` with seeded device token | Tapping a physical card → backend record + frontend update |
| 11 | API README | env vars, setup, run, troubleshooting, WhatsApp whitelist howto | A fresh clone can `pnpm i && pnpm db:reset && pnpm dev` in three commands |

Each numbered slice = its own commit (or commit cluster), with a clear subject line.

---

## 16. Test discipline

- Co-located unit tests for service/repository logic.
- One integration test per module via `supertest` exercising a full request path.
- **Every module ships at least one tenant-isolation negative test.**
- The auth module ships dedicated tests for: bad OTP, expired OTP, attempt exhaustion, replay (same OTP twice), rate-limit triggering.
- Tap ingestion module ships tests for: dedupe, 60s in→out flag, manual override audit, absent scheduling with offline-device suppression, replay-on-recompute idempotency.
- WhatsApp client is unit-tested with `fetch` stubbed; integration test for the auth flow uses a feature flag (`WHATSAPP_DRY_RUN=true`) that short-circuits the HTTP call and writes the rendered template payload to `notification_logs` instead.

---

## 17. Explicitly out of scope (do not implement)

- Pagination on list endpoints.
- SMS sends (rows written, no network).
- Urdu WhatsApp templates.
- Multi-instance Fastify; Redis pub/sub.
- Push notifications.
- Multi-school super-admin.
- Authorized pickup, bus tracking, visitor management, fees, homework.
- The `POST /dev/simulate-tap` endpoint (replaced by `/readers/tap`).
- An admin UI for issuing/revoking device tokens (seed-only for now).
- Production hosting, secrets management, CI, deployment.

---

## 18. Open items at the time of writing

None blocking. Real WhatsApp credentials get swapped in at deploy time (placeholders in `.env.example`); template registration in Meta Business Manager is a deploy-time activity, not a code activity.
