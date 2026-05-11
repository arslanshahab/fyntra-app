import { useQuery } from '@tanstack/react-query'
import { z } from 'zod'

import { apiGet } from '../../services/api/client'
import { useAuthStore } from '../../stores/auth'
import { attendanceRecordSchema } from '../../types/schemas'

const attendanceListSchema = z.array(attendanceRecordSchema)

export interface ReportFilters {
  from: string
  to: string
  classId?: string
}

export const reportKeys = {
  attendance: (filters: ReportFilters) => ['reports', 'attendance', filters] as const,
}

export function useAttendanceReportQuery(filters: ReportFilters, enabled = true) {
  const params = new URLSearchParams()
  params.set('from', filters.from)
  params.set('to', filters.to)
  if (filters.classId) params.set('classId', filters.classId)
  return useQuery({
    queryKey: reportKeys.attendance(filters),
    queryFn: () => apiGet(`/attendance?${params.toString()}`, attendanceListSchema),
    enabled,
    staleTime: 30_000,
  })
}

const DEFAULT_API_BASE = '/api'

function baseUrl(): string {
  const fromEnv = import.meta.env.VITE_API_BASE_URL
  if (!fromEnv) return DEFAULT_API_BASE
  return fromEnv.replace(/\/$/, '')
}

/** Streams the CSV blob, triggers a browser download with a sane filename. */
export async function downloadAttendanceCsv(filters: ReportFilters): Promise<void> {
  const token = useAuthStore.getState().token
  const params = new URLSearchParams()
  params.set('from', filters.from)
  params.set('to', filters.to)
  if (filters.classId) params.set('classId', filters.classId)

  const res = await fetch(`${baseUrl()}/reports/attendance.csv?${params.toString()}`, {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  })
  if (!res.ok) throw new Error(`Report download failed: ${res.status}`)
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `attendance-${filters.from}-to-${filters.to}${filters.classId ? `-${filters.classId}` : ''}.csv`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
