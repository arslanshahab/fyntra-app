# Polish backlog

Quirks observed during the Phase 1 polish pass that are **not** in scope for
this pass. Logged here so they're captured but don't block momentum.

## Pre-existing test failures (not introduced by this pass)

- **`apps/api/src/modules/readers/service.test.ts`** — "ingests a tap, creates
  record, writes in_app + whatsapp logs" expects the dispatched WhatsApp
  template name to be `fyntra_tap_event` but the dispatcher emits
  `hello_world`. Pre-dates this branch; suspect a template-name change that
  outpaced the test. 90/91 API tests pass otherwise.

## Visual / behavioural quirks

_(none captured yet — slice 1 only touched tokens and atoms)_

## RTL / Urdu regressions noticed in passing

_(none yet — Urdu is explicitly out of scope for this pass)_
