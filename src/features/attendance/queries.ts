import { useQuery } from '@tanstack/react-query'
import { z } from 'zod'

import { apiGet } from '../../services/api/client'
import { useRealtime } from '../../hooks/useRealtime'
import { attendanceRecordSchema, tapEventSchema, type School } from '../../types/schemas'
import { dateStrInKarachi } from '../../utils/datetime'

const attendanceListSchema = z.array(attendanceRecordSchema)
const tapEventListSchema = z.array(tapEventSchema)

export const attendanceKeys = {
  todayByStudent: (studentId: string) => ['attendance', 'today', studentId] as const,
  todayAll: ['attendance', 'today', 'all'] as const,
  timelineByStudent: (studentId: string) => ['attendance', 'timeline', studentId] as const,
  tapsByStudentDay: (studentId: string, date: string) => ['tapEvents', studentId, date] as const,
  liveFeed: ['tapEvents', 'live'] as const,
}

/** Today's attendance row for a student. Polls inside the school window. */
export function useTodayAttendance(studentId: string | undefined, school: School | undefined) {
  const { refetchInterval } = useRealtime(school)
  return useQuery({
    queryKey: studentId
      ? attendanceKeys.todayByStudent(studentId)
      : ['attendance', 'today', 'none'],
    queryFn: async () => {
      const today = dateStrInKarachi()
      const rows = await apiGet(
        `/students/${studentId}/timeline?from=${today}&to=${today}`,
        attendanceListSchema,
      )
      return rows[0] ?? null
    },
    enabled: !!studentId,
    refetchInterval,
    refetchIntervalInBackground: false,
  })
}

/** Last 30 days of AttendanceRecord rows for a student, newest first. */
export function useStudentTimeline(studentId: string | undefined, days = 30) {
  return useQuery({
    queryKey: studentId
      ? attendanceKeys.timelineByStudent(studentId)
      : ['attendance', 'timeline', 'none'],
    queryFn: () => {
      const today = dateStrInKarachi()
      const from = dateStrInKarachi(new Date(Date.now() - (days - 1) * 86400000))
      return apiGet(
        `/students/${studentId}/timeline?from=${from}&to=${today}`,
        attendanceListSchema,
      )
    },
    enabled: !!studentId,
    staleTime: 5 * 60_000,
  })
}

/** All of today's attendance rows. Used by the admin dashboard stat row. */
export function useTodayAttendanceAll(school: School | undefined) {
  const { refetchInterval } = useRealtime(school)
  return useQuery({
    queryKey: attendanceKeys.todayAll,
    queryFn: () => apiGet(`/attendance?date=${dateStrInKarachi()}`, attendanceListSchema),
    refetchInterval,
    refetchIntervalInBackground: false,
  })
}

/** Today's tap events, newest first. Backing query for the admin live feed. */
export function useLiveTapFeed(school: School | undefined) {
  const { refetchInterval } = useRealtime(school)
  return useQuery({
    queryKey: attendanceKeys.liveFeed,
    queryFn: () => {
      const today = dateStrInKarachi()
      return apiGet(
        `/tap-events?from=${today}T00:00:00.000%2B05:00&to=${today}T23:59:59.999%2B05:00`,
        tapEventListSchema,
      )
    },
    refetchInterval,
    refetchIntervalInBackground: false,
  })
}

/** Tap events for a single day for a student. */
export function useDayTapEvents(studentId: string | undefined, date: string | undefined) {
  return useQuery({
    queryKey:
      studentId && date ? attendanceKeys.tapsByStudentDay(studentId, date) : ['taps', 'none'],
    queryFn: () =>
      apiGet(
        `/tap-events?studentId=${studentId}&from=${date}T00:00:00.000%2B05:00&to=${date}T23:59:59.999%2B05:00`,
        tapEventListSchema,
      ),
    enabled: !!studentId && !!date,
    staleTime: 60_000,
  })
}
