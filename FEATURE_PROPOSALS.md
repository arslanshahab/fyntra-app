# Feature proposals

Behaviours flagged during the Phase 1 UI/UX polish pass that go beyond visual
fixes into new functionality. Each waits on explicit approval before any code
lands.

---

## 1. Live freshness indicator on parent home

**Problem.** A parent opens the app to find out whether their child has
tapped in. There is no signal of *when* the data was last fetched. If a
device is briefly offline or the network is slow, the parent might be looking
at five-minute-stale data and not know it. For a child-safety product, that
trust gap is the single biggest emotional miss.

**Proposed UX.** A small line under the greeting:
`Refreshed 12 seconds ago · live ●` — subtle pulsing dot when freshness
under 30s, amber 30s–2min, red over 2min. Optional companion: pull-to-refresh
gesture on mobile that re-runs the relevant queries.

**Audience.** Parents primarily; also useful on the Admin live tap feed.

**Effort.** Small. Query timestamps are already available from TanStack
Query (`dataUpdatedAt`). The static indicator is ~1–2h. Pull-to-refresh
adds 1–2h with a small custom hook or a library.

---

## 2. Sort children by attendance urgency

**Problem.** A parent with 2+ children sees an unordered list. The card most
likely to need attention (absent / unverified) might be second or third.

**Proposed UX.** Default sort: `absent → unverified → not_yet → late →
at_school → left`. The "needs attention" card always lands on top. Optional
companion: a one-line summary above the list ("1 child not yet at school").

**Audience.** Parents with 2+ children.

**Effort.** Tiny — sort function on the existing children array, ~30 min.
Summary line is another ~30 min if approved.

---

## 3. Enrich ChildCard with duration on campus + last gate location

**Problem.** The status hero says "Ali is at school" but doesn't tell parents
*how long* their child has been there or *which gate* they tapped in at.
Both are derivable from data the page already has.

**Proposed UX.** Below the status subtitle, a thin divider, then two micro
rows: `3h 12m on campus` (mono numeric) and `Main gate · Reader 02` (stone
secondary text). Hide on `pre_school` / `not_yet` / `no_card` where the
metadata doesn't apply.

**Audience.** Parents.

**Effort.** Small — `formatDuration(firstInAt, now)` helper, last-device
lookup from the live feed query, new i18n keys. ~1–2h.

---

## 4. "Today / Yesterday" relative date labels on the timeline

**Problem.** Timeline day rows currently read as `Mon, May 14`. A parent
glancing at the page has to do the mental math to know which row is *today*
or *yesterday* — the rows most likely to be relevant to a same-day check-in
question.

**Proposed UX.** When the row date matches the user's current Karachi-tz
date, render `Today · Mon, May 14`. When it's yesterday, `Yesterday · Sun,
May 13`. Older rows keep the current short format. Relative prefix uses
stone-900 weight, the date metadata stone-500 — visual hierarchy reflects
recency.

**Audience.** Parents.

**Effort.** Tiny — `relativeDayLabel(dateStr, now)` helper, one i18n key
pair, ~30 min including Urdu translation.

---

## 5. Filter chips on Teacher Today

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

## 6. Responsive teacher today layout (table → card list on mobile)

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

## 7. Admin sidebar nav grouping

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

## 8. "All clear / N anomalies" headline on admin dashboard

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
