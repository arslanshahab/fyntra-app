# Feature proposals

Behaviours flagged during the Phase 1 UI/UX polish pass that go beyond visual
fixes into new functionality. Each waits on explicit approval before any code
lands.

---

## 1. Filter chips on Teacher Today

**Problem.** In a 30-student class, a teacher who wants to find "who hasn't
tapped in yet" has to scan the whole table. The Status column shows the
information but doesn't let them *narrow* the view.

**Proposed UX.** Chip row above the table: `All · Not yet · Late · Absent ·
Left early`. Each chip shows the count (`Not yet 4`). Selected chip filters
the rendered rows. Defaults to All. Counts come from the same attendance
data already loaded.

**Audience.** Teachers, especially mid-morning and end-of-day.

**Effort.** Small — derived state, no new queries. ~1h including i18n keys
and basic responsive treatment.

---

## 2. Responsive teacher today layout (table → card list on mobile)

**Problem.** The teacher today table is wider than a 360px phone viewport.
Currently it horizontal-scrolls inside the card, which is functional but
discoverable only to teachers who try. In-classroom mobile use means the
Override button can end up off-screen.

**Proposed UX.** Below the `sm` breakpoint, replace the table with a stacked
card list: one card per student showing avatar + name + roll on top, the
status badge prominently below the name, first-in / last-out times on a
single mono line, and the Override button as a full-width secondary. Above
`sm`, keep the current table. Single roster source, two presentations.

**Audience.** Teachers using phones in-classroom.

**Effort.** Medium — ~2-3h. Mostly markup duplication behind a `sm:hidden`
/ `hidden sm:block` switch; same data, same actions.

---

## 3. Admin sidebar nav grouping

**Problem.** The admin sidebar currently lists seven items as one flat list
(Dashboard, Students, Cards, Devices, Reports, Notifications, Anomalies).
There's no visual hierarchy — Anomalies (operational alerts) reads at the
same weight as Cards (a roster CRUD page).

**Proposed UX.** Group with thin section labels:
- **Overview**: Dashboard
- **People**: Students, Cards
- **Infrastructure**: Devices
- **Operations**: Reports, Notifications, Anomalies

Section labels in `text-micro uppercase stone-500`, a `border-stone-100`
divider between groups. Anomalies' badge stays as today.

**Audience.** Admins, especially as the product adds more nav items.

**Effort.** Tiny — restructure the `NAV` array into groups and render
section headers. ~30 min including i18n keys.

---

## 4. "All clear / N anomalies" headline on admin dashboard

**Problem.** Admin opens the dashboard and has to scan four numbers to know
whether anything needs attention. The aggregate state ("everything's fine"
vs. "something's wrong") should be the first thing they read.

**Proposed UX.** Display-size headline above the stat row: `All clear` (in
status-present) when zero anomalies, or `N anomalies need review` (in
status-late) when >0. Pair with the existing anomaly count badge in the
sidebar nav.

**Audience.** Admins.

**Effort.** Small if the anomaly count query is already wired (it is — see
`useAnomalyList` in `AdminLayout`). ~1h for the headline + copy keys.
