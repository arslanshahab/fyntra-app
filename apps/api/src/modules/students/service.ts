import { NotFoundError } from '../../lib/errors.js'
import type { TenantContext } from '../../types/tenant-context.js'
import { studentsRepo, type ListStudentsFilters } from './repository.js'

export async function listStudents(ctx: TenantContext, filters: ListStudentsFilters) {
  const rows = await studentsRepo.list(ctx, filters)
  const out = await Promise.all(
    rows.map(async (s) => ({
      id: s.id,
      fullName: s.fullName,
      rollNumber: s.rollNumber,
      classId: s.classId,
      schoolId: s.schoolId,
      guardianIds: await studentsRepo.guardianIds(ctx, s.id),
      photoUrl: s.photoUrl ?? undefined,
      status: s.status,
    })),
  )
  return out
}

export async function getStudent(ctx: TenantContext, id: string) {
  const s = await studentsRepo.findById(ctx, id)
  if (!s) throw new NotFoundError('Student not found')
  const guardians = await studentsRepo.guardians(ctx, id)
  return {
    id: s.id,
    fullName: s.fullName,
    rollNumber: s.rollNumber,
    classId: s.classId,
    schoolId: s.schoolId,
    guardianIds: guardians.map((g) => g.id),
    photoUrl: s.photoUrl ?? undefined,
    status: s.status,
    guardians: guardians.map((g) => ({
      id: g.id,
      role: g.role,
      fullName: g.fullName,
      phone: g.phone,
      email: g.email ?? undefined,
      preferredLanguage: g.preferredLanguage,
      schoolId: g.schoolId,
    })),
  }
}
