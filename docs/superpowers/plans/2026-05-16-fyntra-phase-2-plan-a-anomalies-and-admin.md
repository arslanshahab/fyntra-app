# Fyntra Phase 2 — Plan A: Anomalies, Device Admin, Pagination Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Surface attendance anomaly flags that Phase 1.5 already wrote to the DB, give admins API + UI control over devices and their tokens, and put cursor pagination on the three heavy list endpoints. By the end of this plan, admins can resolve "did this card actually belong to this student today?" without DB access, can rotate device tokens through the admin UI (no more `db:seed`), and the live feed scrolls past 500 rows.

**Architecture:** Mechanical extension of Phase 1.5. Each new endpoint follows the established `routes.ts` + `service.ts` + `repository.ts` + `*.test.ts` shape, takes `TenantContext` as first arg in services, filters by `schoolId` first in repos, returns 404 on cross-tenant access, ships ≥1 negative test. Pagination is header-based (`X-Next-Cursor`) so existing wire shapes don't change. The anomaly surface is a schema additive on `attendanceRecordSchema` — no new endpoints for the read path, only a `?anomalies=true` filter on the existing `/attendance`.

**Tech Stack:** Same as Phase 1.5. No new dependencies.

**Spec reference:** `docs/superpowers/specs/2026-05-16-fyntra-phase-2-backend-design.md`. This plan implements §10 slices 1–7.

---

## Working conventions (carried over from Phase 1.5 — apply throughout)

- **Tenant filter first.** Every Drizzle `where(and(...))` in a tenant-scoped repo starts with `eq(table.schoolId, ctx.schoolId)`. Cross-tenant 404, never 403.
- **Service signature:** `function name(ctx: TenantContext, ...args)`.
- **Role gates** for mutations: `requireRole(['admin'])` on every device-mutation route. Anomaly-read endpoints are open to all authenticated school members.
- **Per-module test discipline:** ≥1 cross-tenant negative test exercising the HTTP layer; ≥1 role-gate test for any new mutation.
- **Test isolation:** `vitest.config.ts` continues to enforce `singleFork: true` + `fileParallelism: false`. New e2e files do NOT call `pool.end()`.
- **Commits:** one per slice, exact subject per slice, **no Co-Author trailer, no mention of Claude/AI**.
- **No barrel files.** Direct imports with `.js` extension on relative paths.
- **Zod schemas** for request bodies / queries come from `@fyntra/schemas` where they exist — extend the package when the contract grows.

---

## File structure (after Plan A completes)

```
apps/api/src/modules/
├── attendance/                 (gains anomaly fields in serializer + ?anomalies filter)
├── devices/                    (expands: full CRUD + token sub-resources)
│   ├── repository.ts           (extended)
│   ├── service.ts              (extended)
│   ├── routes.ts               (extended)
│   ├── tokens.repository.ts    (NEW — device_tokens queries)
│   ├── tokens.service.ts       (NEW)
│   └── devices.test.ts         (extended)
├── tap-events/                 (gains pagination)
├── notifications/              (gains pagination)
├── students/                   (gains pagination)
├── cards/                      (gains pagination)
└── ...                         (unchanged)

apps/api/src/lib/
└── pagination.ts               (NEW — shared limit/cursor/X-Next-Cursor helper)

apps/web/src/pages/admin/
├── AdminAnomalyCenter.tsx      (NEW)
├── AdminDevicesPage.tsx        (rewritten for CRUD)
└── AdminDeviceDetailPage.tsx   (NEW — tokens table + roll-over flow)

apps/web/src/features/pagination/
└── useCursorList.ts            (NEW)
```

---

# Slice 1 — Anomaly wire surface

**Goal:** Three boolean flags already on `attendance_records` (`card_anomaly`, `left_without_scan`, `flagged_for_review`) reach the wire. Admins can filter via `?anomalies=true`.

**Schema change (`packages/schemas/src/index.ts`):**

```ts
export const attendanceRecordSchema = z.object({
  // ... existing fields
  cardAnomaly: z.boolean().optional(),
  leftWithoutScan: z.boolean().optional(),
  flaggedForReview: z.boolean().optional(),
})
```

**Files to touch:**

- `packages/schemas/src/index.ts` — extend `attendanceRecordSchema`.
- `apps/api/src/modules/attendance/service.ts` — extend `toWire` helper:
  ```ts
  cardAnomaly: r.cardAnomaly || undefined,
  leftWithoutScan: r.leftWithoutScan || undefined,
  flaggedForReview: r.flaggedForReview || undefined,
  ```
  (Falsy → omitted from serialization.)
- `apps/api/src/modules/students/service.ts` — same treatment for `getStudentTimeline`.
- `apps/api/src/modules/reports/service.ts` — same treatment for `getAttendanceForRange`. CSV output keeps existing columns — anomaly flags are not added to CSV in Phase 2.1.
- `apps/api/src/modules/attendance/routes.ts` (or the report routes) — add `?anomalies=true` query option. Implementation: when `true`, filter to rows where `cardAnomaly OR leftWithoutScan OR flaggedForReview`.

**Tests (`apps/api/src/modules/attendance/...`):**

1. Seed an `attendance_records` row with `cardAnomaly: true`. GET `/attendance?date=...` returns the row with `cardAnomaly: true` and the other two flags absent.
2. GET `/attendance?date=...&anomalies=true` returns only flagged rows.
3. Flags default to `false` in DB → omitted from wire in the no-flag case.

**Commit:** `feat(api): surface attendance anomaly flags on wire + anomalies filter`

---

# Slice 2 — Admin Anomaly Center page

**Goal:** `apps/web/src/pages/admin/AdminAnomalyCenter.tsx` lists recent anomalies; sidebar badge shows count.

**Files:**

- `apps/web/src/pages/admin/AdminAnomalyCenter.tsx` — new page. List view, date-range filter (default: last 7 days), row layout: student name, date, reason chip(s), link to student timeline.
- `apps/web/src/features/attendance/queries.ts` — add `useAnomalyList(school)` hook calling `GET /attendance?from=...&to=...&anomalies=true`.
- `apps/web/src/router/...` — register `/admin/anomalies` route, admin-gated.
- `apps/web/src/components/organisms/AdminSidebar.tsx` (or equivalent) — add menu item with badge count.
- `apps/web/src/i18n/locales/{en,ur}.json` — copy for `Anomaly Center`, `Card swapped`, `No tap-out`, `Same-direction taps`, etc.

**Tests:**

- Component renders zero-state when no anomalies.
- Renders the right chip for each flag combination.
- Date-range filter mutates the query key.

**Commit:** `feat(web): admin anomaly center with reason chips`

---

# Slice 3 — Device admin endpoints

**Goal:** Full CRUD on devices + token sub-resource. Admin only.

**New endpoints (per spec §7.2):**

- `POST /devices` — body `{ label, direction }`. Returns `Device`.
- `PATCH /devices/:id` — body `{ label?, direction? }`. Returns `Device`.
- `DELETE /devices/:id` — soft-delete via `deletedAt`. Returns `{ ok: true }`. Existing `tap-events` reads coalesce removed-device labels to `(removed device)`.
- `GET /devices/:id/tokens` — returns `DeviceToken[]` (hash row, never plaintext).
- `POST /devices/:id/tokens` — body `{ label }`. Generates a new plaintext token, hashes it, stores it. Returns `{ token: <plaintext>, deviceToken: DeviceToken }`. The plaintext is shown **once**.
- `DELETE /devices/:id/tokens/:tokenId` — sets `revokedAt = now()`. Returns the updated `DeviceToken`.

**Wire schema addition (`@fyntra/schemas`):**

```ts
export const deviceTokenSchema = z.object({
  id: idSchema,
  deviceId: idSchema,
  label: z.string(),
  createdAt: z.string(),
  revokedAt: z.string().optional(),
})

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
```

**Files:**

- `apps/api/src/modules/devices/repository.ts` — extend with `insert`, `patch`, `softDelete`.
- `apps/api/src/modules/devices/tokens.repository.ts` — new: `listForDevice(ctx, deviceId)`, `insertHashed(ctx, deviceId, hashedToken, label)`, `revoke(ctx, deviceId, tokenId)`.
- `apps/api/src/modules/devices/service.ts` — extend with `createDevice`, `patchDevice`, `softDeleteDevice`.
- `apps/api/src/modules/devices/tokens.service.ts` — new: `listTokens`, `issueToken` (returns plaintext + hashed row), `revokeToken`.
- `apps/api/src/modules/devices/routes.ts` — register the 6 new routes, each behind `[requireAuth, requireRole(['admin'])]`.

**Tests (extend `devices.test.ts`):**

1. Admin creates a device → 200 + row in DB.
2. Parent attempts to create a device → 403.
3. Admin of A patches device of B → 404.
4. Issue token → returns plaintext exactly once; subsequent `GET /devices/:id/tokens` shows hashed row only.
5. Revoke token → `revokedAt` set; existing `resolveDeviceByToken` rejects the now-revoked plaintext (regression test).
6. Soft-delete device → `deletedAt` set; subsequent tap-events using a token for that device → 401 (device tokens for deleted devices resolve to null in existing `resolveDeviceByToken`).

**Commit:** `feat(api): device CRUD + token issue/revoke (admin)`

---

# Slice 4 — Admin Devices page rewrite

**Goal:** Admin UI mirrors the new API. Create, label, retire, rotate tokens.

**Files:**

- `apps/web/src/pages/admin/AdminDevicesPage.tsx` — rewrite. List view with create button (modal: label, direction).
- `apps/web/src/pages/admin/AdminDeviceDetailPage.tsx` — new. Edit / soft-delete header. Tokens table with `label`, `created`, `revoked` columns. Issue-token modal showing plaintext **once** with copy button + warning. Revoke action with confirm dialog.
- `apps/web/src/features/devices/queries.ts` — extend with mutations: `useCreateDevice`, `usePatchDevice`, `useDeleteDevice`, `useIssueDeviceToken`, `useRevokeDeviceToken`.
- `apps/web/src/components/organisms/LiveTapFeed.tsx` — when `event.deviceId` is set but absent from `devicesById` (i.e. the device was soft-deleted but historical tap_events still reference it), render `t('admin.liveFeed.removedDevice')` instead of the stray UUID. Same pattern in `ChildTimelinePage.tsx`.
- `apps/web/src/i18n/locales/{en,ur}.json` — copy for all new strings, including `admin.liveFeed.removedDevice = "(removed device)"`.

**Tests:**

- `AdminDevicesPage.test.tsx` — list renders, create modal opens, mutation fires.
- `AdminDeviceDetailPage.test.tsx` — issue-token modal shows plaintext from the response, hides on close, list refreshes.

**Commit:** `feat(web): admin device management — CRUD + token roll-over`

---

# Slice 5 — Pagination on heavy list endpoints

**Goal:** `/tap-events`, `/notifications`, `/attendance`, `/students`, `/cards` accept `limit` + `cursor` and return `X-Next-Cursor`. Response body stays a JSON array (backwards compatible).

**Files:**

- `apps/api/src/modules/tap-events/routes.ts` + `repository.ts` — add `limit` (default 100, max 500) and `cursor` (last item's id) to the query. Repo: filter `lt(tapEvents.id, cursor)` when cursor present; always order by `id DESC` (equivalent to occurredAt DESC since UUID v7 is time-sortable).
- `apps/api/src/modules/notifications/routes.ts` + `repository.ts` — same treatment.
- `apps/api/src/modules/attendance/routes.ts` (or reports module) — same treatment. Note: attendance is keyed on `(date, studentId)`, so the cursor uses the row's `id` like the others — works because UUID v7 IDs preserve insertion order.
- `apps/api/src/modules/students/routes.ts` + `repository.ts` — same treatment. Cursor pages over students within a school (with existing `classId` / `search` / `guardianId` filters still applied).
- `apps/api/src/modules/cards/routes.ts` + `repository.ts` — same treatment. Cursor pages over cards within a school (with existing `status` filter still applied).
- `apps/api/src/lib/pagination.ts` — new helper: parse `limit` + `cursor` from query, compute `nextCursor` from the returned rows, set `X-Next-Cursor` header. Single helper reused by all five routes.

**Tests:**

1. Without `cursor`, GET returns up to `limit` rows newest-first.
2. With `cursor=<lastId>`, GET returns rows older than that id.
3. End-of-list response has no `X-Next-Cursor` header.
4. `limit` over 500 → clamps to 500.
5. Existing tests (no limit/cursor) pass unchanged — array shape preserved.

**Commit:** `feat(api): cursor pagination on /tap-events, /notifications, /attendance`

---

# Slice 6 — Frontend pagination wiring

**Goal:** Admin live feed + parent timeline scroll past the first page.

**Files:**

- `apps/web/src/features/pagination/useCursorList.ts` — new hook. Thin wrapper over React Query's `useInfiniteQuery` that:
  - Calls a fetcher receiving `cursor?: string`.
  - Reads `X-Next-Cursor` from the response headers (the api client must expose headers — extend `apiGet` to return both `data` and `headers` or expose a `apiGetWithHeaders` variant).
  - Sets `getNextPageParam` to the header value.
- `apps/web/src/services/api/client.ts` — extend with `apiGetWithHeaders<T>(path, schema)` returning `{ data: T, headers: Headers }`. Existing `apiGet` keeps its signature.
- `apps/web/src/features/attendance/queries.ts` — convert `useLiveTapFeed` from `useQuery` to `useCursorList`. Existing consumers (`LiveTapFeed.tsx`) gain a `fetchNextPage()` ref.
- `apps/web/src/components/organisms/LiveTapFeed.tsx` — add a "Load more" button or IntersectionObserver-driven auto-load when scrolled to bottom.
- `apps/web/src/pages/parent/ChildTimelinePage.tsx` — calendar view gains "Load earlier" via the same hook.

**Tests:**

- `useCursorList.test.tsx` — mocks fetch with `X-Next-Cursor` headers across two pages, asserts the hook flattens correctly.
- `LiveTapFeed.test.tsx` — adds an assertion that "Load more" triggers a second fetch.

**Commit:** `feat(web): cursor-based infinite scroll on live feed + timeline`

---

# Slice 7 — README update + verification matrix

**Goal:** `apps/api/README.md` gains a Phase 2.1 section. Tag the release.

**Files:**

- `apps/api/README.md` — add a "Phase 2.1 changes" section under the existing "Phase 2 hooks" heading: describe the anomaly flags, device admin endpoints (with example curls), and the pagination headers.
- Move the "Phase 2 hooks" entries that just shipped to a new "Recently shipped" sub-section, leaving only the still-deferred items under "Phase 2 hooks".

**Verification matrix** (run before tagging):

```sh
pnpm -r typecheck                              # all packages strict
pnpm -F api test                                # rises from 59 to 70+
pnpm -F web typecheck && pnpm -F web lint && pnpm -F web test
pnpm -F bridge build

# Curl smokes (admin-token required):
curl /attendance?date=2026-05-16&anomalies=true       # returns flagged rows
curl -X POST /devices -d '{"label":"North Gate","direction":"both"}'
curl -X POST /devices/<id>/tokens -d '{"label":"north dev"}'   # returns plaintext ONCE
curl /tap-events?limit=10                             # returns ≤10, X-Next-Cursor header set
curl /tap-events?limit=10&cursor=<lastId>            # returns the next page
curl /students?limit=10                               # returns ≤10, X-Next-Cursor header set
curl /cards?limit=10&status=active                    # filter + pagination compose

# Frontend smoke:
- Admin → Anomaly Center renders zero-state when no flagged rows.
- Admin → Devices: create, edit label, issue token (copy plaintext), revoke.
- Parent → child timeline scrolls past one month via "Load earlier".
```

**Tag:**

```sh
git tag -a v2.1-complete -m "Phase 2.1: anomaly surfaces + device admin + pagination"
```

**Commit:** `docs(api): Phase 2.1 README updates`

---

# Recommended execution order

The seven slices have soft dependencies:

1. **Slice 1** (anomaly wire) — independent. Warms up the schema-extension pattern.
2. **Slice 5** (pagination api) — independent; can land alongside Slice 1 if parallelized.
3. **Slice 3** (device admin api) — independent.
4. **Slice 2** (anomaly UI) — depends on Slice 1.
5. **Slice 4** (devices UI) — depends on Slice 3.
6. **Slice 6** (pagination UI) — depends on Slice 5.
7. **Slice 7** (README + tag) — last.

Parallelizable: backend slices (1, 3, 5) can land in any order. Frontend slices (2, 4, 6) follow their respective backend slice. Slice 7 is the cap.

---

# Plan-A-defined out of scope

These belong to later Phase 2 sub-phases or Phase 3:

- Anomaly **resolution** workflow (admin "acknowledges" a flag → it stops appearing in the center). Spec §11 Q1 locked: defer to Phase 2.1.5.
- Bulk device-token revocation ("revoke all tokens for this device").
- Per-token `lastUsedAt` tracking (would require a write on every `resolveDeviceByToken` hit).
- Push notifications, SMS provider, Urdu templates, multi-school super-admin — all Phase 2.2/2.3.
