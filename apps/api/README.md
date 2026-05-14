# Fyntra API

Fastify backend for Fyntra — RFID-based school attendance. Phase 1.5 implements the full §6 contract from the spec at [`docs/superpowers/specs/2026-05-13-fyntra-phase-1.5-backend-design.md`](../../docs/superpowers/specs/2026-05-13-fyntra-phase-1.5-backend-design.md).

## Quick start

```sh
pnpm install
docker compose up -d        # postgres on :5433
cp .env.example .env        # then fill in JWT_SECRET / READER_TOKEN_SECRET
pnpm -F api db:migrate
pnpm -F api db:seed
pnpm -F api dev             # api on :3000
```

Run `docker compose` from inside `apps/api/` — that's where `docker-compose.yml` lives. The seed command prints plaintext device tokens to stdout; capture one if you intend to point the bridge at this api (the DB stores only the bcrypt hash).

## Environment variables

Every var in `.env.example`:

| Var | Notes |
| --- | --- |
| `PORT` | Fastify listen port. Default `3000`. |
| `NODE_ENV` | `development` / `test` / `production`. Gates `db:reset` and pino-pretty. |
| `LOG_LEVEL` | pino level: `trace` / `debug` / `info` / `warn` / `error`. |
| `DATABASE_URL` | Postgres DSN. Default points at the docker-compose container on `:5433`. The test DB `fyntra_test` lives on the same instance. |
| `JWT_SECRET` | Signs parent/admin/teacher JWTs. **≥32 chars, required.** Generate with `openssl rand -base64 32`. |
| `READER_TOKEN_SECRET` | HMAC key for device tokens. **≥32 chars, required.** Generate with `openssl rand -base64 32`. |
| `WHATSAPP_PHONE_NUMBER_ID` | Meta Cloud API sender ID. Placeholder until templates are approved. |
| `WHATSAPP_ACCESS_TOKEN` | Meta access token. Placeholder until approved. |
| `WHATSAPP_BUSINESS_ACCOUNT_ID` | WABA ID. Placeholder until approved. |
| `WHATSAPP_APP_SECRET` | Reserved for webhook verification. Placeholder until approved. |
| `WHATSAPP_DRY_RUN` | When `true`, `sendTemplate` logs the payload and returns success without hitting Meta. Flip to `false` only after templates are approved **and** recipient phones are whitelisted in the testing account. |
| `CORS_ORIGIN` | Single origin string. The Vite dev server defaults to `http://localhost:5173`. |

The env parser is Zod-backed: the api refuses to start if `JWT_SECRET` or `READER_TOKEN_SECRET` is shorter than 32 chars.

## WhatsApp setup

1. Register three templates in Meta Business Manager:
   - `fyntra_otp` — variables: `{{1}}` 4-digit code.
   - `fyntra_tap_event` — `{{1}}` child name, `{{2}}` `HH:MM` Karachi time.
   - `fyntra_absent` — `{{1}}` child name, `{{2}}` date like `Wed 13 May`.
2. Add recipient phones to the testing-account whitelist in Meta's UI. Unwhitelisted numbers will 400/403.
3. Fill `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_BUSINESS_ACCOUNT_ID`, `WHATSAPP_APP_SECRET` in `.env`.
4. Set `WHATSAPP_DRY_RUN=false`. Restart `pnpm -F api dev`.
5. Verify with a real tap:

   ```sh
   curl -X POST http://localhost:3000/readers/tap \
     -H 'content-type: application/json' \
     -d '{"rfidUid":"...","direction":"in","occurredAt":"2026-05-13T07:48:00.000Z","deviceToken":"..."}'
   ```

   A message should arrive on a whitelisted phone within seconds. If not, check the api logs for the Meta error payload.

See the WhatsApp Cloud API docs for template syntax and approval timelines.

## Scripts

All scripts run from the repo root as `pnpm -F api <script>`.

| Script | What it does |
| --- | --- |
| `dev` | `tsx watch src/server.ts` — hot-reload dev server. |
| `build` | `tsc` → `dist/`. |
| `start` | `node dist/server.js`. |
| `typecheck` | `tsc --noEmit`. |
| `lint` | `eslint .`. |
| `test` | `vitest run --passWithNoTests`. |
| `test:watch` | `vitest` in watch mode. |
| `db:generate` | drizzle-kit migration generator (runs through `tsx/cjs` — see troubleshooting). |
| `db:migrate` | Apply pending migrations. |
| `db:seed` | Seed schools, users, students, devices. **Prints plaintext device tokens to stdout** — capture them for the bridge. |
| `db:reset` | Drops `public` + `drizzle` schemas, then re-migrates. Requires `CONFIRM=yes`. Refuses to run when `NODE_ENV=production`. |

## Architecture overview

Module-per-feature shape. Each module under `src/modules/` ships a `routes.ts` + `service.ts` + `repository.ts` + `*.test.ts`. The 12 current modules: `attendance`, `auth`, `cards`, `classes`, `devices`, `health`, `me`, `notifications`, `readers`, `reports`, `students`, `tap-events`.

**Multi-tenancy.** Every service takes a `TenantContext` (`schoolId`, `userId`, `role`) as its first argument. Repositories start every `where(and(...))` clause with `eq(table.schoolId, ctx.schoolId)`. Cross-tenant access returns `404`, never `403` — we don't leak existence.

**Realtime.** The in-memory `Broker` in `src/services/realtime.ts` exposes pub/sub on `school:{id}` and `student:{id}` channels. The `/ws` endpoint subscribes parents to their kids' channels and admin/teacher to the whole school channel. Single-process only; a multi-instance deployment will need a Redis-backed broker.

**Background jobs.** `node-cron` runs a per-school absent-backfill job at `startTime + absentThresholdMinutes` — see `src/services/attendance-jobs.ts`. A separate 30-second sweep (`src/services/heartbeat-sweep.ts`) marks devices `offline` after 180 s of silence and broadcasts to the school channel.

**Notifications.** `src/services/whatsapp.ts` wraps Meta's Graph API — `sendTemplate` honors `WHATSAPP_DRY_RUN`. Dispatch is multi-channel: `dispatch()` reads per-user notification settings and writes a `notification_logs` row per channel (`whatsapp`, `sms`, `push`) with success/failure status. SMS and push are logged as failed today; see Phase 2 hooks.

For the full picture (schemas, contract, sequence diagrams), see the spec at [`docs/superpowers/specs/2026-05-13-fyntra-phase-1.5-backend-design.md`](../../docs/superpowers/specs/2026-05-13-fyntra-phase-1.5-backend-design.md).

## Troubleshooting

- **Port 3000 in use.** `PORT=3030 pnpm -F api dev`. Another local project occasionally squats on 3000.
- **"relation does not exist" after `db:reset`.** `db:reset` drops both the `public` and `drizzle` schemas before re-migrating; if it still fails, restart the docker container: `docker compose restart`.
- **WS connection closes with code 4001.** The JWT is expired or signed with a different `JWT_SECRET`. Re-login, or rotate the secret with care (rotating invalidates every active session).
- **WhatsApp 400/403.** Recipient phone isn't in the testing-account whitelist, or the access token expired. Check both in Meta Business Manager.
- **Test DB races.** `vitest.config.ts` sets `singleFork: true` and `fileParallelism: false`. The config exists for a reason — if you fork tests across files, the shared test DB will thrash.
- **Drizzle generate crashes with an esbuild `es2023` error.** Known workaround: `node --require tsx/cjs node_modules/drizzle-kit/bin.cjs generate` — already what `pnpm -F api db:generate` runs. Don't replace it with bare `drizzle-kit generate`.

## Phase 2 hooks

Deferred from Phase 1.5. Not in scope today; named here so future maintainers know the boundary.

- Push notifications (FCM / APNS). `notification_logs` rows are written as `failed` today.
- Multi-school super-admin role. Today every user is bound to exactly one `schoolId`.
- Card-anomaly UI surface. `attendance_records.cardAnomaly` is set by the backend but not exposed on any wire contract.
- Device admin via API (issue / rotate device tokens). Today, only `db:seed` produces plaintext tokens.
- SMS provider integration. Logged as failed today.
- Urdu WhatsApp templates. Only English templates are approved for Phase 1.5.
- Pagination on list endpoints. Everything still returns a JSON array.
- Reports beyond attendance — per-class stats, trend charts, etc.
