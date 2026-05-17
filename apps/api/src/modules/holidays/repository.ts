import { and, asc, eq, gte, lte } from 'drizzle-orm'
import { db } from '../../db/client.js'
import { schoolHolidays, type SchoolHolidayRow, type HolidayKind } from '../../db/schema/holidays.js'
import { newId } from '../../lib/ids.js'
import type { TenantContext } from '../../types/tenant-context.js'

export interface HolidayListFilters {
  from?: string
  to?: string
}

export interface HolidayInsertInput {
  date: string
  label: string
  kind: HolidayKind
  effectiveEndTime?: string
  createdBy: string
}

export interface HolidayPatchInput {
  date?: string
  label?: string
  kind?: HolidayKind
  effectiveEndTime?: string
}

export const holidaysRepo = {
  async list(ctx: TenantContext, filters: HolidayListFilters): Promise<SchoolHolidayRow[]> {
    const conds = [eq(schoolHolidays.schoolId, ctx.schoolId)]
    if (filters.from) conds.push(gte(schoolHolidays.date, filters.from))
    if (filters.to) conds.push(lte(schoolHolidays.date, filters.to))
    return db
      .select()
      .from(schoolHolidays)
      .where(and(...conds))
      .orderBy(asc(schoolHolidays.date))
  },

  async findById(ctx: TenantContext, id: string): Promise<SchoolHolidayRow | undefined> {
    const rows = await db
      .select()
      .from(schoolHolidays)
      .where(and(eq(schoolHolidays.schoolId, ctx.schoolId), eq(schoolHolidays.id, id)))
      .limit(1)
    return rows[0]
  },

  async findByDate(ctx: TenantContext, date: string): Promise<SchoolHolidayRow | undefined> {
    return this.findByDateForSchool(ctx.schoolId, date)
  },

  // Same lookup keyed on bare schoolId for callers that don't have a
  // TenantContext — chiefly the absent-cron job, which runs without an
  // authenticated session.
  async findByDateForSchool(schoolId: string, date: string): Promise<SchoolHolidayRow | undefined> {
    const rows = await db
      .select()
      .from(schoolHolidays)
      .where(and(eq(schoolHolidays.schoolId, schoolId), eq(schoolHolidays.date, date)))
      .limit(1)
    return rows[0]
  },

  async insert(ctx: TenantContext, input: HolidayInsertInput): Promise<SchoolHolidayRow> {
    const id = newId()
    const rows = await db
      .insert(schoolHolidays)
      .values({
        id,
        schoolId: ctx.schoolId,
        date: input.date,
        label: input.label,
        kind: input.kind,
        effectiveEndTime: input.effectiveEndTime ?? null,
        createdBy: input.createdBy,
      })
      .returning()
    return rows[0]!
  },

  async patch(
    ctx: TenantContext,
    id: string,
    input: HolidayPatchInput,
  ): Promise<SchoolHolidayRow | undefined> {
    const patch: Partial<Pick<SchoolHolidayRow, 'date' | 'label' | 'kind' | 'effectiveEndTime'>> = {}
    if (input.date !== undefined) patch.date = input.date
    if (input.label !== undefined) patch.label = input.label
    if (input.kind !== undefined) patch.kind = input.kind
    // When kind changes away from half_day, the service clears
    // effectiveEndTime explicitly; when it changes to half_day, the service
    // requires effectiveEndTime present in the payload. Both paths land here.
    if (input.effectiveEndTime !== undefined) patch.effectiveEndTime = input.effectiveEndTime
    const rows = await db
      .update(schoolHolidays)
      .set(patch)
      .where(and(eq(schoolHolidays.schoolId, ctx.schoolId), eq(schoolHolidays.id, id)))
      .returning()
    return rows[0]
  },

  async delete(ctx: TenantContext, id: string): Promise<boolean> {
    const rows = await db
      .delete(schoolHolidays)
      .where(and(eq(schoolHolidays.schoolId, ctx.schoolId), eq(schoolHolidays.id, id)))
      .returning({ id: schoolHolidays.id })
    return rows.length > 0
  },
}
