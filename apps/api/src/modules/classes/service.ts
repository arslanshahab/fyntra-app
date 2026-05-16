import { NotFoundError } from '../../lib/errors.js'
import type { TenantContext } from '../../types/tenant-context.js'
import { classesRepo } from './repository.js'

export async function listClasses(ctx: TenantContext) {
  return await classesRepo.list(ctx)
}

export async function classAttendanceForDay(
  ctx: TenantContext,
  classId: string,
  ymd: string,
) {
  const cls = await classesRepo.findById(ctx, classId)
  if (!cls) throw new NotFoundError('Class not found')
  const rows = await classesRepo.attendanceForDay(ctx, classId, ymd)
  return { classId, date: ymd, rows }
}
