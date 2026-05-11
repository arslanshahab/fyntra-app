# Fyntra — Phase 1 Frontend

> Parent peace of mind. School operational ease. Built for Lahore schools.

This README is the canonical context for building Fyntra's Phase 1 web application. Read it in full before writing any code.

---

## 1. Product context

**Fyntra** is a school attendance and child-safety platform. Phase 1 focuses on **gate-based RFID attendance with real-time parent notifications**.

**The problem.** Parents of school-going children (ages 3–16) in Lahore have no real-time visibility into whether their child arrived at school, when they left, or who collected them. Schools rely on manual paper attendance, which is slow and error-prone.

**The solution (Phase 1).** RFID readers installed at school gates record student entries and exits. Each event triggers a notification to the parent (WhatsApp / SMS / in-app) and feeds an automated attendance system used by teachers and admins.

**Target market.** Small to medium private schools in Lahore, Pakistan. 200–2000 students per school.

**Positioning.** This is sold as a *child-safety* product to parents and a *competitive differentiator* to school principals. The interface should reflect that — calm, trustworthy, quietly modern.

---

## 2. Phase 1 scope

### In scope
- Three user roles: **Parent**, **School Admin**, **Class Teacher**
- Parent web app (mobile-first, PWA-ready)
- Admin & teacher dashboard (desktop-first, responsive)
- RFID tap event ingestion (mocked via a dev simulator in Phase 1)
- Near-real-time status updates (polling for now; abstracted so it can become WebSocket later)
- Bilingual UI (English + Urdu, with RTL support)
- Manual override for missed/forgotten taps, with audit trail
- Daily / weekly / monthly attendance reports (CSV export)
- Device (RFID reader) status panel
- Card management (assign / replace / deactivate)
- Notification history and settings

### Out of scope (deferred to Phase 2+)
- Authorized pickup verification
- Bus tracking / geofencing
- Visitor management
- Fee management
- Homework / diary
- Real WhatsApp Business API integration (mocked for now)
- Push notifications (PWA hook stubbed only)
- Multi-school super-admin

---

## 3. Tech stack

- **React 19** + **TypeScript** (strict mode, no implicit `any`)
- **Vite** as the build tool
- **vite-plugin-pwa** for an installable PWA shell — manifest, theme color, icons, minimal offline cache. **No push notifications in Phase 1** (push stays stubbed).
- **Tailwind CSS** v3+ with the official RTL plugin
- **React Router** v6
- **TanStack Query (React Query)** for all server state
- **Zustand** for UI-only state (auth context, theme, locale)
- **React Hook Form** + **Zod** for forms and validation
- **react-i18next** for localization
- **date-fns** + **date-fns-tz** (canonical timezone: `Asia/Karachi`)
- **MSW (Mock Service Worker)** for API mocking in dev/test
- **Lucide React** for iconography
- **Recharts** for the small handful of charts in the admin dashboard
- **Vitest** + **React Testing Library** for tests
- **nfc-pcsc** + **ws** — bridge service only (dev tooling, not shipped to production)

---

## 4. Directory structure (atomic design)

Repo layout — the frontend lives in `src/` and a small dev-only bridge service for the ACR122U reader (see §13) lives in a sibling `bridge/` directory:

```
fyntra/
├── src/                      # frontend application (atomic design below)
├── bridge/                   # local-only RFID bridge service (dev only)
│   ├── package.json
│   ├── tsconfig.json
│   └── src/
│       └── index.ts
└── package.json              # frontend root
```

Frontend `src/` breakdown:

```
src/
├── app/                      # Route definitions, providers, layout root
│   ├── App.tsx
│   ├── routes.tsx
│   └── providers.tsx         # Query, i18n, theme, auth, router
├── components/
│   ├── atoms/                # Button, Input, Badge, Avatar, Spinner, Icon, Tag
│   ├── molecules/            # FormField, StatBlock, NotificationItem, SearchBar
│   ├── organisms/            # DashboardHeader, AttendanceTable, ChildCard, LiveTapFeed
│   └── templates/            # DashboardLayout, AuthLayout, ParentLayout
├── pages/                    # One folder per page; thin, composes templates + organisms
│   ├── auth/
│   ├── parent/
│   ├── admin/
│   └── teacher/
├── features/                 # Feature-scoped, non-component logic
│   ├── attendance/           # queries, mutations, helpers, types
│   ├── students/
│   ├── devices/
│   ├── notifications/
│   └── reports/
├── hooks/                    # Reusable hooks (useAuth, useDebounce, useMediaQuery, useRealtime)
├── services/
│   ├── api/                  # axios/fetch client, endpoint functions
│   └── mocks/                # MSW handlers, seed data, simulators
├── stores/                   # Zustand stores (auth, ui)
├── types/                    # Shared TypeScript types and Zod schemas
├── utils/                    # date, format, csv, classnames helpers
├── i18n/                     # locales/en.json, locales/ur.json, config
├── styles/                   # tailwind globals, fonts
└── main.tsx
```

**Rules of the road:**
- **Atoms** are presentational only. No data fetching, no business logic. They take props, render markup, fire callbacks.
- **Molecules** combine atoms. Light internal state (focus, hover, open/closed) is fine. No API calls.
- **Organisms** are where features compose. They may consume hooks and Query.
- **Pages** are thin shells that wire organisms into a template.
- **Features** hold non-component code per domain (queries, mutations, types, helpers). Components live under `components/`.
- **No barrel files** (`index.ts` re-exports) at any level — they hurt tree-shaking and bundle clarity. Import from the file directly.

---

## 5. Core data models

```ts
type ID = string;

type Role = "parent" | "admin" | "teacher";

interface User {
  id: ID;
  role: Role;
  fullName: string;
  phone: string;          // E.164, e.g. "+923001234567"
  email?: string;
  preferredLanguage: "en" | "ur";
  schoolId: ID;
}

interface School {
  id: ID;
  name: string;
  address: string;
  timezone: "Asia/Karachi";
  startTime: string;            // "07:45"
  endTime: string;              // "13:30"
  lateThresholdMinutes: number; // grace window after startTime before status flips to "late"
  absentThresholdMinutes: number; // after startTime + this, status flips to "absent" and a high-priority parent alert fires (default 30)
}

interface Student {
  id: ID;
  fullName: string;
  rollNumber: string;
  classId: ID;
  schoolId: ID;
  guardianIds: ID[];      // -> User[] with role === "parent"
  cardId?: ID;            // current active card
  photoUrl?: string;
  status: "active" | "inactive";
}

interface Class {
  id: ID;
  name: string;           // "Grade 3 — Section A"
  teacherId: ID;
  schoolId: ID;
}

interface CardAuditEntry {
  at: string;             // ISO
  byUserId: ID;
  action: "issued" | "assigned" | "replaced" | "lost" | "deactivated" | "reactivated";
  note?: string;
}

interface Card {
  id: ID;
  rfidUid: string;            // unique
  studentId?: ID;             // null if unassigned
  status: "active" | "lost" | "replaced" | "deactivated";
  issuedAt: string;           // ISO
  auditLog: CardAuditEntry[]; // see §7.5 — every mutation appends an entry,
                              // seed cards start with one "issued" entry
}

interface Device {
  id: ID;
  schoolId: ID;
  label: string;          // "Main Gate", "Side Gate"
  direction: "in" | "out" | "both";
  status: "online" | "offline";
  lastHeartbeat: string;  // ISO
}

interface TapEvent {
  id: ID;
  cardId: ID;
  rfidUid: string;
  deviceId: ID;
  direction: "in" | "out";
  occurredAt: string;     // ISO
  source: "device" | "manual";
  manualOverrideBy?: ID;
  manualReason?: string;
}

interface AttendanceRecord {
  id: ID;
  studentId: ID;
  date: string;           // "YYYY-MM-DD"
  firstInAt?: string;
  lastOutAt?: string;
  status: "present" | "absent" | "late" | "left_early";
  isManual: boolean;
}

interface NotificationLog {
  id: ID;
  recipientUserId: ID;
  channel: "whatsapp" | "sms" | "in_app";
  eventId: ID;
  status: "queued" | "sent" | "delivered" | "failed";
  sentAt?: string;
  payload: { title: string; body: string };
}
```

All types should also have **Zod schemas** in `types/schemas.ts`. Validate every API response against its schema before it touches Query state — this catches contract drift early.

---

## 6. API contract (mocked in Phase 1 via MSW)

The frontend is built against this contract. MSW serves these in dev. To swap to a real backend later, change only the base URL and disable the worker.

**Authentication is OTP-only for all three roles in Phase 1.** No password flow. This matches local user expectations (Careem, JazzCash, banks all use OTP) and keeps one auth surface to build and test. After `verify-otp` succeeds, the client redirects by `user.role`.

```
POST   /auth/request-otp           { phone } -> { ok: true }
POST   /auth/verify-otp            { phone, otp } -> { token, user }
GET    /me                         -> { user, school,
                                          children?: Student[],
                                          assignedClass?: Class }
                                     # school is always present — clients need
                                     # start/end times and thresholds to render
                                     # the parent hero status. children present
                                     # iff user.role === "parent".
                                     # assignedClass present iff user.role ===
                                     # "teacher".

GET    /students?classId=&search=&guardianId=
                                     # guardianId=me is a convenience filter for refetch flows;
                                     # parent home uses /me.children as the primary path
GET    /students/:id               -> Student & { guardians: User[] }
                                     # guardians are inlined so the admin
                                     # detail page doesn't fan out to a
                                     # per-guardian users lookup.
GET    /students/:id/timeline?from=&to=
                                     # returns AttendanceRecord[] — day summaries
                                     # for the parent calendar / list view.

GET    /classes
GET    /classes/:id/attendance?date=

GET    /cards?status=
POST   /cards/assign               { cardId, studentId }
POST   /cards/replace              { studentId, newRfidUid }
PATCH  /cards/:id                  { status }

GET    /devices
GET    /devices/:id

GET    /tap-events?from=&to=&studentId=
                                     # day-drill: parent taps a day in the timeline,
                                     # we call this scoped to that single day.
POST   /tap-events/manual          { studentId, direction, occurredAt, reason }

GET    /attendance?date=&from=&to=&classId=
                                     # date filters to a single day; from/to
                                     # filter to an inclusive range. Used by
                                     # the admin reports preview.
GET    /reports/attendance.csv?from=&to=&classId=

GET    /notifications?userId=&status=
                                     # Admin / teacher: omit userId to see all
                                     # notifications across the school. Parents
                                     # are always scoped to their own logs.
POST   /notifications/:id/retry    -> NotificationLog
                                     # Admin / teacher only. Flips status to
                                     # 'sent' and refreshes sentAt — the
                                     # backend will actually retry in Phase 1.5.
PATCH  /notifications/settings     { channels: { whatsapp, sms, in_app },
                                     events:   { tap_in, tap_out, late, absent,
                                                 manual_override, device_offline } }
                                     # All values are booleans.
                                     # `device_offline` is admin/teacher only —
                                     # do not expose it in the parent settings UI.
                                     # UI language is User.preferredLanguage, NOT a
                                     # notification setting.

# Dev-only
POST   /dev/simulate-tap           { rfidUid, deviceId, direction }
```

**Real-time strategy for Phase 1.** Poll the relevant endpoints every 15 seconds on the parent home and admin live-attendance views. Stub a `useRealtime(channel)` hook so we can swap to WebSockets later without touching consumers.

**Polling lifecycle.** `useRealtime` is the *only* place this logic lives — consumers pass a channel and forget about it.
- Active window: `[school.startTime − 30min, school.endTime + 30min]` in `Asia/Karachi`. Outside the window, polling pauses entirely.
- Tab visibility: when `document.visibilityState !== "visible"` (Page Visibility API), polling pauses. Resumes on visibility change.
- Window focus: React Query's `refetchOnWindowFocus: true` handles the "user came back to the tab" refresh — we don't need to duplicate that.
- This avoids draining batteries on phones left open after pickup and silences pointless background traffic.

---

## 7. Key user flows

### Parent (mobile)
1. Phone + OTP login. Any 4-digit OTP is valid in dev.
2. **Home** — one card per child. Today's status as the hero line: *"Ahmad is at school. Arrived 7:42 AM"*. Below: a simple recent-events strip.
3. **Child timeline** — calendar/list view of the last 30 days. Each day shows in-time, out-time, and status badge. Tap a day to see its individual events.
4. **Notification settings** — channels (WhatsApp / SMS / in-app) toggles per event type, language toggle.
5. **Pre-school empty state** — *"School starts in 32 minutes. We'll let you know the moment Ahmad arrives."*

### Admin (desktop)
1. Phone + OTP login (same flow as parent — OTP is canonical for all roles in Phase 1).
2. **Dashboard** — today's headline numbers (present, absent, late, no-tap-yet) as four stat cards, plus a live tap feed and device status row.
3. **Students** — searchable list, filter by class, bulk import (CSV).
4. **Student detail** — profile, guardian list, card history, attendance history.
5. **Cards** — assign, replace, mark lost, deactivate. Always show audit trail.
6. **Devices** — grid of gate readers with status, last heartbeat, label. Includes the dev-only "simulate tap" panel.
7. **Reports** — date range picker, class filter, CSV export, preview table.
8. **Notifications log** — filter by status, retry failed.

### Teacher (desktop / tablet)
1. Phone + OTP login.
2. **My class today** — roster with arrival times and statuses. Quick manual-override action per row (must capture reason).
3. **Class history** — last 30 days.

---

## 8. Localization

- All copy goes through i18next. **No hardcoded strings.**
- Two locales: `en.json` and `ur.json`. Keys must be identical between them.
- Urdu is RTL. Set `dir` at the document level based on locale, and use Tailwind's `rtl:` variants where layouts need to flip.
- Use **Noto Nastaliq Urdu** (or **Jameel Noori Nastaleeq** as fallback) for Urdu text blocks. Configure in `tailwind.config.ts`.
- Format dates via `date-fns/locale` (`enUS`, `ur`). Always use `Asia/Karachi` as the source-of-truth timezone — don't trust the device clock for canonical timestamps.
- Phone numbers: store in E.164, display in local format (`0300-1234567`).
- **English is the default UI language.** Fresh sessions always start in English regardless of `navigator.language`. The i18n detector reads only from `localStorage` (`fyntra:locale`); the locale toggle persists there. `user.preferredLanguage` from `/me` and `verify-otp` is **data, not a session-time override** — the verify-otp success handler does not call `i18n.changeLanguage`. Urdu polish (translations, RTL acceptance screenshot) is the final step of Phase 1.

---

## 9. Edge cases the UI must handle

- **No card assigned yet.** Show "card not assigned" — don't render this as "absent".
- **No tap by `startTime + absentThresholdMinutes`.** Status flips from "not yet arrived" to `absent` and a **high-priority parent alert** fires (the `absent` notification event). The `late` status uses `lateThresholdMinutes`; `absent` uses `absentThresholdMinutes` — they are two distinct thresholds and must not be reused for each other. If the relevant gate device is offline at that moment, see "Device offline" below — show `unverified` and do not fire the absent alert.
- **Card swapped between students mid-day.** Admin view shows a warning indicator on affected attendance records.
- **Device offline.** Admin dashboard shows the affected gate as degraded. Don't infer absence from no-tap if the relevant device is down — show "unverified" instead, and suppress the absent-parent-alert for affected students.
- **Tap-in without a tap-out by EOD.** Mark as "left without scan" and surface to admin for review.
- **Two consecutive same-direction taps within 30s.** Treat the second as a duplicate; show in event log as deduped.
- **Tap-in then tap-out within 60s.** Flag for admin review (likely a card test or a kid that turned around at the gate).
- **Manual overrides.** Always show *who* overrode *what*, *when*, and *why*. Reason is a required field.
- **Multi-school parent.** Phase 1 assumes a parent belongs to one school. If the API returns multiple, surface a clear error rather than guessing.

---

## 10. Visual & UX principles

- **Calm by default.** Neutral palette. Reserve red strictly for genuine alerts. Soft green = present, muted amber = late, neutral grey = not yet arrived, deep red only for missed pickup or device-down.
- **One number per screen.** Parent home should answer *one* question prominently — *"Is my child at school right now?"* — not present a dashboard.
- **Mobile-first for parent.** Single column, thumb-reachable actions, 44px+ tap targets.
- **Density-tolerant for admin.** Tables are fine — keep them legible and filterable.
- **Empty states with personality, not panic.** *"No taps yet — school starts at 7:45"* beats *"0 records"*.

---

## 11. Build & run

```bash
# Frontend
npm install
npm run dev          # Vite dev with MSW enabled, http://localhost:5173
npm run build
npm run test
npm run lint

# Bridge service (separate terminal — only needed when working on the Simulate Tap page)
cd bridge
npm install
npm run dev          # ACR122U → WebSocket bridge on ws://localhost:8787
```

For a full dev session involving the reader, both processes need to run. A root-level `concurrently` script may be added later to start both at once, but two terminals is fine for now.

Dev seed data: 1 school, 4 classes, 60 students, 2 devices, 3 admin users, 4 teachers, 60 parents. Configurable in `services/mocks/seed.ts`.

Environment variables (`.env.local`, copy from `.env.example`):

```
VITE_API_BASE_URL=http://localhost:5173/api
VITE_USE_MOCKS=true
VITE_DEFAULT_LOCALE=en
```

### Demo logins

Any 4-digit OTP works in dev (`1234` is fine). The seed assigns deterministic phone numbers per role — the third digit-block is the role marker (`00` parent / `11` admin / `12` teacher), which is easy to misread when typing:

| Role    | Phone format                | Example         |
| ------- | --------------------------- | --------------- |
| Parent  | `+9230010000NN` (60 users)  | `+923001000001` |
| Admin   | `+9230011000NN` (3 users)   | `+923001100001` |
| Teacher | `+9230012000NN` (4 users)   | `+923001200001` |

To force-clear a stuck session, delete the `fyntra:auth` key from `localStorage` and refresh.

---

## 12. Development principles

- **TypeScript strict.** No `any` without a `// @ts-expect-error: <reason>` comment.
- **Zod at the edges.** Validate every API response against a Zod schema before it enters Query state.
- **Accessible by default.** Semantic HTML, keyboard nav, visible focus rings, color contrast WCAG AA minimum, aria labels on icon-only buttons.
- **Co-locate tests.** `Button.tsx` next to `Button.test.tsx`.
- **Small, named patterns.** When adding a new molecule, follow the structure of the existing ones. When inventing a new pattern, add a 3-line header comment explaining why.
- **No premature abstractions.** First two usages: copy. Third usage: extract.
- **Loading and error states are first-class.** Every Query consumer must handle `isLoading`, `isError`, and the empty case explicitly. No silent skeletons forever.

---

## 13. The hardware reality

The reader for Phase 1 is an **ACR122U** (ACS, USB NFC reader, PC/SC standard). It does *not* emulate a keyboard — it speaks the PC/SC protocol and is accessed through the operating system's smart-card framework (`CryptoTokenKit` on macOS, `pcscd` on Linux, WinSCard on Windows). Card UIDs cannot be obtained by capturing keyboard input.

To bridge the reader to the frontend during development, Phase 1 includes a small **local-only bridge service** alongside the frontend, in its own subdirectory of the repo:

```
fyntra/
├── src/        # frontend (existing app)
└── bridge/     # local-only Node service: ACR122U → WebSocket → frontend
```

The bridge is a small Node service (~50 lines) that:
1. Connects to the ACR122U via the `nfc-pcsc` library
2. Listens for card taps
3. Exposes a WebSocket server at `ws://localhost:8787`
4. Emits messages of shape `{ type: "card_tapped", uid: string, readerName: string, timestamp: string }` whenever a card is tapped

The frontend's **Simulate Tap** page (admin → devices → simulate) integrates with the bridge as follows:
- On mount, connects to `ws://localhost:8787` via a `useReaderBridge()` hook
- Shows the bridge connection status prominently (Disconnected / Connecting / Connected)
- Receives `card_tapped` events and auto-fills the UID input
- Still supports manual UID entry and direction selection (in/out) for when the reader is unavailable
- Submitting fires `POST /dev/simulate-tap` against MSW exactly as before — the API contract does not change

This bridge is **dev-only**. It is not part of production. In Phase 1.5, when the real backend exists, deployed readers will communicate with the backend directly over network protocols, and this bridge service will be retired.

**macOS-specific note.** On modern macOS, the built-in CryptoTokenKit framework occasionally claims the ACR122U before `nfc-pcsc` can. If the bridge reports no readers found despite the device being visible in System Information → USB, the fix is documented in `bridge/README.md` — typically involves preventing macOS's built-in smart-card driver from claiming the device. The bridge's README must include OS-specific setup notes.

**Implementation status.** The frontend half is built — `useReaderBridge()` connects to `ws://localhost:8787`, surfaces the live connection status on the admin Simulate Tap page, and auto-fills the UID input when a `card_tapped` message arrives. The standalone `bridge/` Node service is **not yet built**; until it is, the Simulate Tap page shows "Bridge disconnected" and the admin can submit UIDs by hand. The hook short-circuits in tests via an `import.meta.env.MODE === 'test'` guard so jsdom doesn't churn on dead connections.