import { eq } from 'drizzle-orm'
import { db } from '../../db/client.js'
import { schools } from '../../db/schema/schools.js'
import type { TenantContext } from '../../types/tenant-context.js'

type SchoolRow = typeof schools.$inferSelect

export interface SchoolPatchInput {
  startTime?: string
  endTime?: string
  lateThresholdMinutes?: number
  absentThresholdMinutes?: number
  workingDays?: string[]
  // null clears the field; undefined leaves it unchanged.
  halfDayCutoffTime?: string | null
  academicYearStart?: string | null
  academicYearEnd?: string | null
}

export const schoolsRepo = {
  async findById(schoolId: string): Promise<SchoolRow | undefined> {
    const rows = await db.select().from(schools).where(eq(schools.id, schoolId)).limit(1)
    return rows[0]
  },

  async patch(ctx: TenantContext, input: SchoolPatchInput): Promise<SchoolRow | undefined> {
    const patch: Partial<Pick<
      SchoolRow,
      | 'startTime'
      | 'endTime'
      | 'lateThresholdMinutes'
      | 'absentThresholdMinutes'
      | 'workingDays'
      | 'halfDayCutoffTime'
      | 'academicYearStart'
      | 'academicYearEnd'
      | 'updatedAt'
    >> = { updatedAt: new Date() }
    if (input.startTime !== undefined) patch.startTime = input.startTime
    if (input.endTime !== undefined) patch.endTime = input.endTime
    if (input.lateThresholdMinutes !== undefined) patch.lateThresholdMinutes = input.lateThresholdMinutes
    if (input.absentThresholdMinutes !== undefined) patch.absentThresholdMinutes = input.absentThresholdMinutes
    if (input.workingDays !== undefined) patch.workingDays = input.workingDays
    if (input.halfDayCutoffTime !== undefined) patch.halfDayCutoffTime = input.halfDayCutoffTime
    if (input.academicYearStart !== undefined) patch.academicYearStart = input.academicYearStart
    if (input.academicYearEnd !== undefined) patch.academicYearEnd = input.academicYearEnd
    const rows = await db
      .update(schools)
      .set(patch)
      .where(eq(schools.id, ctx.schoolId))
      .returning()
    return rows[0]
  },
}
