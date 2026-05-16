# Polish backlog

Quirks observed during the Phase 1 polish pass that are **not** in scope for
this pass. Logged here so they're captured but don't block momentum.

## Pre-existing test failures (not introduced by this pass)

- **`apps/web/src/pages/auth/LoginPage.test.tsx`** — the "invalid phone" test
  asserts on the substring `/valid pakistani mobile number/i`, but the active
  English locale string is the more generic "Enter a valid phone number in
  international format (e.g. +923001234567 or +971501234567)." The test was
  red on `main` before slice 1 started; left alone here. Fix: either tighten
  the locale copy back to "Pakistani mobile number" or relax the test regex.

## Visual / behavioural quirks

_(none captured yet — slice 1 only touched tokens and atoms)_

## RTL / Urdu regressions noticed in passing

_(none yet — Urdu is explicitly out of scope for this pass)_
