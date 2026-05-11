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

- **React 18** + **TypeScript** (strict mode, no implicit `any`)
- **Vite** as the build tool
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

---

## 4. Directory structure (atomic design)

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
  startTime: string;      // "07:45"
  endTime: string;        // "13:30"
  lateThresholdMinutes: number;
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

interface Card {
  id: ID;
  rfidUid: string;        // unique
  studentId?: ID;         // null if unassigned
  status: "active" | "lost" | "replaced" | "deactivated";
  issuedAt: string;       // ISO
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

```
POST   /auth/request-otp           { phone }
POST   /auth/verify-otp            { phone, otp } -> { token, user }
GET    /me

GET    /students?classId=&search=
GET    /students/:id
GET    /students/:id/timeline?from=&to=

GET    /classes
GET    /classes/:id/attendance?date=

GET    /cards?status=
POST   /cards/assign               { cardId, studentId }
POST   /cards/replace              { studentId, newRfidUid }
PATCH  /cards/:id                  { status }

GET    /devices
GET    /devices/:id

GET    /tap-events?from=&to=&studentId=
POST   /tap-events/manual          { studentId, direction, occurredAt, reason }

GET    /attendance?date=&classId=
GET    /reports/attendance.csv?from=&to=&classId=

GET    /notifications?userId=
PATCH  /notifications/settings     { channels: {...}, events: {...} }

# Dev-only
POST   /dev/simulate-tap           { rfidUid, deviceId, direction }
```

**Real-time strategy for Phase 1.** Poll the relevant endpoints every 15 seconds on the parent home and admin live-attendance views. Stub a `useRealtime(channel)` hook so we can swap to WebSockets later without touching consumers.

---

## 7. Key user flows

### Parent (mobile)
1. Phone + OTP login. Any 4-digit OTP is valid in dev.
2. **Home** — one card per child. Today's status as the hero line: *"Ahmad is at school. Arrived 7:42 AM"*. Below: a simple recent-events strip.
3. **Child timeline** — calendar/list view of the last 30 days. Each day shows in-time, out-time, and status badge. Tap a day to see its individual events.
4. **Notification settings** — channels (WhatsApp / SMS / in-app) toggles per event type, language toggle.
5. **Pre-school empty state** — *"School starts in 32 minutes. We'll let you know the moment Ahmad arrives."*

### Admin (desktop)
1. Email/phone + password login.
2. **Dashboard** — today's headline numbers (present, absent, late, no-tap-yet) as four stat cards, plus a live tap feed and device status row.
3. **Students** — searchable list, filter by class, bulk import (CSV).
4. **Student detail** — profile, guardian list, card history, attendance history.
5. **Cards** — assign, replace, mark lost, deactivate. Always show audit trail.
6. **Devices** — grid of gate readers with status, last heartbeat, label. Includes the dev-only "simulate tap" panel.
7. **Reports** — date range picker, class filter, CSV export, preview table.
8. **Notifications log** — filter by status, retry failed.

### Teacher (desktop / tablet)
1. Login.
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

---

## 9. Edge cases the UI must handle

- **No card assigned yet.** Show "card not assigned" — don't render this as "absent".
- **Card swapped between students mid-day.** Admin view shows a warning indicator on affected attendance records.
- **Device offline.** Admin dashboard shows the affected gate as degraded. Don't infer absence from no-tap if the relevant device is down — show "unverified" instead.
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

```
npm install
npm run dev          # Vite dev with MSW enabled
npm run build
npm run test
npm run lint
```

Dev seed data: 1 school, 4 classes, 60 students, 2 devices, 3 admin users, 4 teachers, 60 parents. Configurable in `services/mocks/seed.ts`.

Environment variables (`.env.local`):

```
VITE_API_BASE_URL=http://localhost:5173/api
VITE_USE_MOCKS=true
VITE_DEFAULT_LOCALE=en
```

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

A USB RFID reader and test cards are already available for local testing. **Most USB RFID readers emulate a keyboard** — they "type" the UID followed by Enter into whatever input has focus.

For Phase 1, this means:
- The dev-only **Simulate Tap** page (admin → devices → simulate) must include a focused input that captures real reader scans, in addition to a manual UID text field and a direction selector.
- A scan triggers `POST /dev/simulate-tap` with the captured UID, the chosen device, and the chosen direction. MSW handles the rest as if it came from a real device.
- This is the *only* point where physical hardware touches the frontend in Phase 1. Real device integration happens at the backend in Phase 1.5.
