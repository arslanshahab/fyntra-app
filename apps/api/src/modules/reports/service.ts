import { stringify } from 'csv-stringify/sync'
import { NotFoundError, ValidationError } from '../../lib/errors.js'
import type { TenantContext } from '../../types/tenant-context.js'
import { reportsRepo, type AttendanceFilters } from './repository.js'

function karachiHHMM(d: Date | null): string {
  if (!d) return ''
  const shifted = new Date(d.getTime() + 5 * 60 * 60 * 1000)
  const h = String(shifted.getUTCHours()).padStart(2, '0')
  const m = String(shifted.getUTCMinutes()).padStart(2, '0')
  return `${h}:${m}`
}

export async function listAttendance(ctx: TenantContext, filters: AttendanceFilters) {
  if (!filters.date && !(filters.from && filters.to)) {
    throw new ValidationError('Either date or (from + to) required')
  }
  if (filters.classId) {
    const exists = await reportsRepo.classExists(ctx, filters.classId)
    if (!exists) throw new NotFoundError('Class not found')
  }
  const rows = await reportsRepo.listRecords(ctx, filters)
  return rows.map((r) => ({
    id: r.id,
    studentId: r.studentId,
    date: r.date,
    firstInAt: r.firstInAt?.toISOString() ?? undefined,
    lastOutAt: r.lastOutAt?.toISOString() ?? undefined,
    status: r.status,
    isManual: r.isManual,
    // Anomaly flags are NOT NULL DEFAULT FALSE in the DB, so `false ||
    // undefined` yields undefined and JSON.stringify drops the key — the
    // wire stays clean for the 99% of rows without any anomaly.
    cardAnomaly: r.cardAnomaly || undefined,
    leftWithoutScan: r.leftWithoutScan || undefined,
    flaggedForReview: r.flaggedForReview || undefined,
  }))
}

export async function attendanceCsv(ctx: TenantContext, filters: AttendanceFilters): Promise<string> {
  if (!filters.from || !filters.to) {
    throw new ValidationError('from + to required for csv export')
  }
  if (filters.classId) {
    const exists = await reportsRepo.classExists(ctx, filters.classId)
    if (!exists) throw new NotFoundError('Class not found')
  }
  const rows = await reportsRepo.listRecords(ctx, filters)
  const { students, classes } = await reportsRepo.hydrationMaps(
    ctx,
    Array.from(new Set(rows.map((r) => r.studentId))),
  )
  const csvRows = rows.map((r) => {
    const s = students.get(r.studentId)
    const cn = s ? (classes.get(s.classId) ?? '') : ''
    return [
      r.date,
      cn,
      s?.fullName ?? '',
      s?.rollNumber ?? '',
      r.status,
      karachiHHMM(r.firstInAt),
      karachiHHMM(r.lastOutAt),
      r.isManual ? 'yes' : 'no',
    ]
  })
  return stringify(
    [
      ['Date', 'Class', 'Student', 'Roll #', 'Status', 'First In (Karachi)', 'Last Out (Karachi)', 'Manual'],
      ...csvRows,
    ],
  )
}
