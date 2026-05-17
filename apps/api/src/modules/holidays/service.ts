import type { Holiday } from '@fyntra/schemas'
import { ConflictError, NotFoundError, ValidationError } from '../../lib/errors.js'
import type { TenantContext } from '../../types/tenant-context.js'
import type { SchoolHolidayRow } from '../../db/schema/holidays.js'
import { holidaysRepo, type HolidayListFilters, type HolidayPatchInput } from './repository.js'

function toWire(r: SchoolHolidayRow): Holiday {
  return {
    id: r.id,
    schoolId: r.schoolId,
    date: r.date,
    label: r.label,
    kind: r.kind,
    effectiveEndTime: r.effectiveEndTime ?? undefined,
    createdBy: r.createdBy ?? undefined,
    createdAt: r.createdAt.toISOString(),
  }
}

export async function listHolidays(ctx: TenantContext, filters: HolidayListFilters) {
  const rows = await holidaysRepo.list(ctx, filters)
  return rows.map(toWire)
}

export interface CreateHolidayInput {
  date: string
  label: string
  kind: 'closed' | 'exam' | 'half_day'
  effectiveEndTime?: string
}

export async function createHoliday(ctx: TenantContext, input: CreateHolidayInput) {
  // Wire schema enforces "half_day ↔ effectiveEndTime" but we defend in the
  // service too — the wire layer can be bypassed by direct service calls.
  if (input.kind === 'half_day' && !input.effectiveEndTime) {
    throw new ValidationError('effectiveEndTime is required when kind is half_day')
  }
  if (input.kind !== 'half_day' && input.effectiveEndTime !== undefined) {
    throw new ValidationError('effectiveEndTime is only allowed when kind is half_day')
  }
  // Postgres unique-constraint on (school_id, date) would throw a generic
  // 500; pre-check turns it into a clean 409 ConflictError. Race conditions
  // (two admins, same date, same second) still get the constraint error —
  // caught below as ConflictError too.
  const existing = await holidaysRepo.findByDate(ctx, input.date)
  if (existing) throw new ConflictError(`A holiday already exists for ${input.date}`)
  try {
    const row = await holidaysRepo.insert(ctx, { ...input, createdBy: ctx.userId })
    return toWire(row)
  } catch (err) {
    if (err instanceof Error && /school_holidays_school_date_uniq/.test(err.message)) {
      throw new ConflictError(`A holiday already exists for ${input.date}`)
    }
    throw err
  }
}

export interface PatchHolidayInputWire {
  date?: string
  label?: string
  kind?: 'closed' | 'exam' | 'half_day'
  effectiveEndTime?: string
}

export async function patchHoliday(
  ctx: TenantContext,
  id: string,
  input: PatchHolidayInputWire,
) {
  const existing = await holidaysRepo.findById(ctx, id)
  if (!existing) throw new NotFoundError('Holiday not found')

  // Compute the effective post-patch kind + effectiveEndTime, then validate
  // the half-day invariant against that composite.
  const nextKind = input.kind ?? existing.kind
  const nextEndTime =
    input.effectiveEndTime !== undefined
      ? input.effectiveEndTime
      : input.kind !== undefined && input.kind !== 'half_day'
        ? undefined // kind changed away from half_day → clear the end time
        : existing.effectiveEndTime ?? undefined

  if (nextKind === 'half_day' && !nextEndTime) {
    throw new ValidationError('effectiveEndTime is required when kind is half_day')
  }
  if (nextKind !== 'half_day' && nextEndTime) {
    throw new ValidationError('effectiveEndTime is only allowed when kind is half_day')
  }

  const patch: HolidayPatchInput = {}
  if (input.date !== undefined) patch.date = input.date
  if (input.label !== undefined) patch.label = input.label
  if (input.kind !== undefined) patch.kind = input.kind
  // Always set effectiveEndTime when we resolved a final value distinct from
  // the existing row — handles both "switch to half_day" (set) and "switch
  // away from half_day" (clear).
  if (nextEndTime !== (existing.effectiveEndTime ?? undefined)) {
    patch.effectiveEndTime = nextEndTime
  }

  try {
    const updated = await holidaysRepo.patch(ctx, id, patch)
    if (!updated) throw new NotFoundError('Holiday not found')
    return toWire(updated)
  } catch (err) {
    if (err instanceof Error && /school_holidays_school_date_uniq/.test(err.message)) {
      throw new ConflictError(`A holiday already exists for ${input.date ?? existing.date}`)
    }
    throw err
  }
}

export async function deleteHoliday(ctx: TenantContext, id: string) {
  const ok = await holidaysRepo.delete(ctx, id)
  if (!ok) throw new NotFoundError('Holiday not found')
  return { ok: true as const }
}

// Used by attendance-jobs to decide whether to skip the absent cron for a
// given school + date. Returns the row when one of the cron-pausing kinds
// matches, otherwise null. `half_day` does NOT pause the cron — kids who
// don't show on a half-day are still absent.
//
// Takes a bare schoolId rather than TenantContext because the cron runs
// without an authenticated session; it iterates per school internally.
export async function findCronPausingHolidayForSchool(
  schoolId: string,
  date: string,
): Promise<SchoolHolidayRow | null> {
  const h = await holidaysRepo.findByDateForSchool(schoolId, date)
  if (!h) return null
  return h.kind === 'closed' || h.kind === 'exam' ? h : null
}
