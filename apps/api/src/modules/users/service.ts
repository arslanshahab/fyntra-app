import type { TeacherPickerEntry } from '@fyntra/schemas'
import type { TenantContext } from '../../types/tenant-context.js'
import { usersRepo } from './repository.js'

export async function listTeachersForPicker(
  ctx: TenantContext,
): Promise<TeacherPickerEntry[]> {
  return await usersRepo.listTeachers(ctx)
}
