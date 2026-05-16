# Fyntra — Phase 2 backend design

## 1. Goal and non-goals

### Goal

Phase 2 expands the Phase 1.5 platform along three axes — **admin trust**, **operations**, and **scale**. The Phase 1.5 backend wrote anomaly flags but never surfaced them; device tokens could only be minted via `db:seed`; list endpoints returned unbounded arrays. Phase 2 fixes all three while keeping the established `TenantContext` + slice + audit-trail discipline intact.

The first slice of Phase 2 (Phase 2.1, covered in detail here) ships:

1. **Anomaly surfaces** — `attendance_records` columns set by the existing recompute path (`cardAnomaly`, `leftWithoutScan`, `flaggedForReview`) reach the wire and a new admin alert center.
2. **Device admin** — admins create, label, retire, and rotate device tokens through the API. `db:seed` becomes a development convenience instead of the only path.
3. **Pagination** — heavy list endpoints (`/tap-events`, `/notifications`, `/attendance`) accept `limit` + `cursor` and return an `X-Next-Cursor` header. Default array shape is preserved for backwards compatibility.

Later sub-phases are catalogued in §2 but not designed in detail here; each gets its own spec when picked up.

### Non-goals (deferred — Phase 3+)

Real production hosting, secrets management beyond `.env*`, multi-region, BullMQ/Redis, multi-instance Fastify, observability beyond Pino, bus tracking, authorized-pickup verification, visitor management, fees, homework. None of these are touched in this spec.

---

## 2. Phase 2 roadmap

### Phase 2.1 — Admin trust (this spec)

| Slice | Scope |
|---|---|
| 1 | Wire surface for anomaly flags (`cardAnomaly`, `leftWithoutScan`, `flaggedForReview`) on `AttendanceRecord` |
| 2 | Admin Anomaly Center UI: filter `/attendance?anomalies=true`, render reason chips |
| 3 | Device admin API: create / patch / soft-delete devices, issue / revoke device tokens |
| 4 | Admin Devices UI: list + detail with token roll-over flow |
| 5 | Pagination on `/tap-events`, `/notifications`, `/attendance` via `limit` + `cursor` + `X-Next-Cursor` header |
| 6 | Frontend pagination wiring (admin live feed + student timeline) |
| 7 | Phase 2.1 README + verification matrix |

### Phase 2.2 — Notification expansion (separate spec when picked up)

- Push notifications via FCM/APNS (rows logged as `failed` today)
- SMS provider integration (Twilio or local equivalent)
- Urdu WhatsApp template variants; dispatch picks the recipient's `preferredLanguage`
- Live `device_offline` event fan-out tied to the heartbeat sweep

### Phase 2.3 — Reporting + roles (separate spec when picked up)

- Multi-school super-admin role (`TenantContext.schoolId: null` semantics)
- Per-class / per-grade attendance trend reports + CSV exports
- Teacher-scoped weekly summaries (auto-emailed or in-app)
- Parent-friendly month summaries

### Phase 2.4 — Ops hardening (separate spec when picked up)

- Sentry / OpenTelemetry plumbing
- Slow-query alerting
- CI/CD pipeline + deploy automation
- Secrets management (SSM / Doppler)
- TLS termination + CDN for `apps/web`

### Phase 3 — Far horizon

Bus tracking, pickup auth, visitor management, fees, homework. Out of scope for any Phase 2 work.

---

## 3. Stack (apps/api)

No new runtime dependencies for Phase 2.1. The pagination cursor uses UUID v7's natural sort order (already in use via `newId()`); no `nanoid` or third-party cursor lib. Device token generation reuses `newDeviceToken()` + `hashToken()` from `apps/api/src/lib/tokens.ts`.

---

## 4. Project layout (apps/api, after Phase 2.1)

```
apps/api/src/modules/
├── attendance/              (gains anomaly serialization)
├── devices/                 (expands: full CRUD + token endpoints)
├── tap-events/              (gains pagination)
├── notifications/           (gains pagination)
└── ...                      (unchanged from Phase 1.5)

apps/web/src/pages/admin/
├── AdminAnomalyCenter.tsx   (NEW)
├── AdminDeviceTokensPage.tsx (NEW or extends existing AdminDevicesPage)
└── ...

apps/web/src/features/pagination/
└── useCursorList.ts         (NEW — shared infinite-scroll hook)
```

---

## 5. Data model changes

### `attendance_records` — surface existing columns

Columns already exist in the schema (set by `recomputeAttendanceForDay` and the EOD job in Phase 1.5):

- `card_anomaly` (boolean, default false) — set when a tap-event references a card whose `studentId` differs from the day's record's student.
- `left_without_scan` (boolean, default false) — set by the EOD job for records with `firstInAt` but no `lastOutAt`.
- `flagged_for_review` (boolean, default false) — set when two same-direction taps occur within 60s for the same card.

Phase 2.1 adds these to the wire schema (`attendanceRecordSchema` in `@fyntra/schemas`) as **optional booleans** — omitted when false, present-and-true when set. No DB migration required.

### `devices` — no new columns

`devices.deleted_at` is already a soft-delete column from Phase 1.5. New endpoints reuse it.

### `device_tokens` — no new columns

`revoked_at`, `label`, `created_at` already exist. New endpoints expose them on the wire (token plaintext is shown **once** on issue, never again).

### Pagination — no schema changes

UUID v7 IDs are time-sortable. Cursor = the last item's id; the api filters `WHERE id < :cursor` (descending order) on the indexed primary key. No new columns or composite indexes needed.

---

## 6. Multi-tenancy

Unchanged from Phase 1.5. Every new endpoint takes `TenantContext` as the first arg, every repo query starts `where(eq(table.schoolId, ctx.schoolId), ...)`. Cross-tenant returns 404, never 403. Role gates use `requireRole(['admin'])` for all device-mutation routes.

---

## 7. API contract — Phase 2.1 additions

### 7.1 Anomaly surface

Existing endpoints get richer payloads. No new routes.

```ts
// @fyntra/schemas
export const attendanceRecordSchema = z.object({
  id: idSchema,
  studentId: idSchema,
  date: z.string(),
  firstInAt: z.string().optional(),
  lastOutAt: z.string().optional(),
  status: attendanceStatusSchema,
  isManual: z.boolean(),
  // Phase 2.1 additions — optional, omitted when false:
  cardAnomaly: z.boolean().optional(),
  leftWithoutScan: z.boolean().optional(),
  flaggedForReview: z.boolean().optional(),
})
```

New query param on `GET /attendance`:

- `anomalies=true` → returns only records where at least one of the three flags is true. Admin-only (parent ignores the param).

### 7.2 Device admin (new endpoints)

All admin-gated (`requireRole(['admin'])`):

| Method | Path | Body | Returns |
|---|---|---|---|
| `POST` | `/devices` | `{ label, direction: 'in' \| 'out' \| 'both' }` | `Device` |
| `PATCH` | `/devices/:id` | `{ label?, direction? }` | `Device` |
| `DELETE` | `/devices/:id` | — | `{ ok: true }` (soft delete via `deletedAt`) |
| `GET` | `/devices/:id/tokens` | — | `DeviceToken[]` (hashed; never plaintext) |
| `POST` | `/devices/:id/tokens` | `{ label }` | `{ token, deviceToken: DeviceToken }` — `token` is plaintext, returned **once** |
| `DELETE` | `/devices/:id/tokens/:tokenId` | — | `DeviceToken` with `revokedAt` set |

New wire shape:

```ts
export const deviceTokenSchema = z.object({
  id: idSchema,
  deviceId: idSchema,
  label: z.string(),
  createdAt: z.string(),
  revokedAt: z.string().optional(),
})
export type DeviceToken = z.infer<typeof deviceTokenSchema>
```

The `resolveDeviceByToken` path in `apps/api/src/modules/readers/service.ts` already checks `revokedAt`; no change needed there.

### 7.3 Pagination

Five endpoints get optional cursor pagination:

- `GET /tap-events?limit=100&cursor=<id>`
- `GET /notifications?limit=100&cursor=<id>`
- `GET /attendance?limit=100&cursor=<id>`
- `GET /students?limit=100&cursor=<id>`
- `GET /cards?limit=100&cursor=<id>`

Rules:

- Default `limit` = 100, hard max = 500 (matches existing tap-events cap).
- If `cursor` is omitted, returns the first `limit` items.
- Sort: always `occurredAt DESC` (or `date DESC` for attendance, `createdAt DESC` for notifications); cursor compares against the same primary key column.
- Response body shape is **unchanged** (array). The next-page cursor goes in an HTTP response header: `X-Next-Cursor: <id>`. When absent, the client is at the end.
- Backwards compatible: clients that don't send `limit` see the existing capped array (500 max). Existing tests pass without modification.

Frontend introduces `useCursorList(queryKey, fetchPage)` — a thin React Query `useInfiniteQuery` wrapper that reads `X-Next-Cursor` from the response. Used by the admin live feed and the student timeline.

---

## 8. Frontend additions

### 8.1 Anomaly Center page

`apps/web/src/pages/admin/AdminAnomalyCenter.tsx` — admin-only route, single column list:

- Filters by date range (default: last 7 days).
- Each row: student name, date, reason chip(s) (`Card swapped`, `No tap-out`, `Same-direction taps`), `View timeline` link.
- WS push: when a tap arrives that sets a new flag, the row appears in real time (uses existing `['attendance']` invalidation key).

Sidebar adds a badge with the unresolved count (records where any flag is true in the last 7 days).

### 8.2 Devices admin page

Replaces the read-only `AdminDevicesPage` (Phase 1.5):

- List + create button (modal: label, direction).
- Detail drawer: edit / soft-delete, tokens table.
- Token roll-over flow: click "Issue new token" → modal shows plaintext **once** with copy button + warning that it won't be shown again. Same modal closes → list refreshes with the new (hashed) row.

### 8.3 Pagination

`useCursorList` consumes the `X-Next-Cursor` header. Admin live feed gains infinite scroll; student timeline (parent) gains "Load earlier" on the calendar view.

---

## 9. Tests

Per the Phase 1.5 discipline:

- Each new module/endpoint ships at least one cross-tenant negative test (admin of A → 404 on resource of B).
- Each new mutation ships at least one role-gate test (parent gets 403).
- Pagination ships a "respects cursor + limit" test plus an "end-of-list returns no X-Next-Cursor" test.
- Anomaly serialization ships a test that asserts the three flags appear when true and are omitted when false.
- Existing Phase 1.5 tests must keep passing — currently 59/59.

Target after Phase 2.1: **70+ tests** (59 + ~12 new).

---

## 10. Slice list (executed in plan A)

1. **Slice 1** — Anomaly wire surface: extend `attendanceRecordSchema`; update attendance + students serializers; add `?anomalies=true` filter.
2. **Slice 2** — Admin Anomaly Center page on web; sidebar badge.
3. **Slice 3** — Device admin endpoints (CRUD + tokens), behind `requireRole(['admin'])`.
4. **Slice 4** — Admin Devices page rewrite (create, edit, soft-delete, issue/revoke tokens).
5. **Slice 5** — Pagination on `/tap-events`, `/notifications`, `/attendance` (header-based).
6. **Slice 6** — Frontend `useCursorList`; admin live feed + parent timeline consume it.
7. **Slice 7** — Phase 2.1 README section + verification matrix; tag `v2.1-complete`.

---

## 11. Decisions locked

1. **Anomaly resolution — deferred.** Phase 2.1 surfaces flags but does not let admins acknowledge / dismiss them. The resolution workflow lands in Phase 2.1.5 (or rolls into 2.2). Surfaces only here.
2. **Device deletion semantics — soft-delete preserved, frontend coalesces.** `devices.deletedAt` stays set on retired devices. The `/devices` list filters them out; existing `tap_events.deviceId` references stay intact. The frontend's `devicesById` map will not contain a soft-deleted device, so the live feed renders `(removed device)` as a fallback (added in Slice 4's i18n). No api-side coalescing required.
3. **Pagination on `/students` and `/cards` — in scope.** Both endpoints get the same `limit` + `cursor` + `X-Next-Cursor` treatment as `/tap-events`, `/notifications`, `/attendance` (now 5 endpoints in Slice 5, up from 3 in the original draft).
4. **WS invalidation for anomalies — reuse existing `['attendance']` invalidation.** No new message type; anomaly flags piggy-back on the same record so the existing `tap` / `absent` push paths invalidate the right query keys already.

---

## 12. Plan reference

Implementation lives in `docs/superpowers/plans/2026-05-16-fyntra-phase-2-plan-a-anomalies-and-admin.md`. That plan ships Phase 2.1 slices 1–7 end-to-end.
