import type { School } from '@fyntra/schemas'
import { NotFoundError, ValidationError } from '../../lib/errors.js'
import type { TenantContext } from '../../types/tenant-context.js'
import { schools } from '../../db/schema/schools.js'
import { schoolsRepo, type SchoolPatchInput } from './repository.js'

type SchoolRow = typeof schools.$inferSelect

function toWire(r: SchoolRow): School {
  return {
    id: r.id,
    name: r.name,
    address: r.address,
    timezone: 'Asia/Karachi',
    startTime: r.startTime,
    endTime: r.endTime,
    lateThresholdMinutes: r.lateThresholdMinutes,
    absentThresholdMinutes: r.absentThresholdMinutes,
    workingDays: r.workingDays as School['workingDays'],
    halfDayCutoffTime: r.halfDayCutoffTime ?? undefined,
    academicYearStart: r.academicYearStart ?? undefined,
    academicYearEnd: r.academicYearEnd ?? undefined,
  }
}

// Empty body is a no-op that returns the current school — easier on the
// admin UI's "save" button than special-casing.
export async function patchSchoolForCaller(
  ctx: TenantContext,
  input: SchoolPatchInput,
): Promise<School> {
  // The Zod request schema already enforces start < end and academic-year
  // start < end. Service-level defence: if the caller PATCHes only one side
  // of either pair, check it against the persisted value too.
  if (input.startTime !== undefined || input.endTime !== undefined) {
    const current = await schoolsRepo.findById(ctx.schoolId)
    if (!current) throw new NotFoundError('School not found')
    const nextStart = input.startTime ?? current.startTime
    const nextEnd = input.endTime ?? current.endTime
    if (nextStart >= nextEnd) {
      throw new ValidationError('startTime must be before endTime')
    }
  }
  if (input.academicYearStart !== undefined || input.academicYearEnd !== undefined) {
    const current = await schoolsRepo.findById(ctx.schoolId)
    if (!current) throw new NotFoundError('School not found')
    const nextStart = input.academicYearStart !== undefined ? input.academicYearStart : current.academicYearStart
    const nextEnd = input.academicYearEnd !== undefined ? input.academicYearEnd : current.academicYearEnd
    if (nextStart && nextEnd && nextStart > nextEnd) {
      throw new ValidationError('academicYearStart must be on or before academicYearEnd')
    }
  }

  const updated = await schoolsRepo.patch(ctx, input)
  if (!updated) throw new NotFoundError('School not found')
  return toWire(updated)
}
