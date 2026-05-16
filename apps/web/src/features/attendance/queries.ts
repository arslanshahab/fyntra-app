import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'

import { apiGet, apiPost } from '../../services/api/client'
import { useRealtime } from '../../hooks/useRealtime'
import {
  attendanceRecordSchema,
  tapEventSchema,
  type School,
  type TapDirection,
  type TapEvent,
} from '@fyntra/schemas'
import { dateStrInKarachi } from '../../utils/datetime'

const attendanceListSchema = z.array(attendanceRecordSchema)
const tapEventListSchema = z.array(tapEventSchema)

export const attendanceKeys = {
  todayByStudent: (studentId: string) => ['attendance', 'today', studentId] as const,
  todayAll: ['attendance', 'today', 'all'] as const,
  timelineByStudent: (studentId: string) => ['attendance', 'timeline', studentId] as const,
  tapsByStudentDay: (studentId: string, date: string) => ['tapEvents', studentId, date] as const,
  liveFeed: ['tapEvents', 'live'] as const,
  classOnDate: (classId: string, date: string) => ['attendance', 'class', classId, date] as const,
  classRange: (classId: string, from: string, to: string) =>
    ['attendance', 'class', classId, 'range', from, to] as const,
}

export const anomalyKeys = {
  list: (from: string, to: string) => ['attendance', 'anomalies', from, to] as const,
}

/** Attendance rows flagged with cardAnomaly / leftWithoutScan / flaggedForReview. */
export function useAnomalyList(from: string, to: string) {
  return useQuery({
    queryKey: anomalyKeys.list(from, to),
    queryFn: () =>
      apiGet(`/attendance?from=${from}&to=${to}&anomalies=true`, attendanceListSchema),
    staleTime: 60_000,
  })
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

/** Today's attendance rows for a single class. Polls inside the school window. */
export function useClassAttendanceToday(classId: string | undefined, school: School | undefined) {
  const { refetchInterval } = useRealtime(school)
  return useQuery({
    queryKey: classId
      ? attendanceKeys.classOnDate(classId, dateStrInKarachi())
      : ['attendance', 'class', 'none'],
    queryFn: () => {
      const today = dateStrInKarachi()
      return apiGet(`/classes/${classId}/attendance?date=${today}`, attendanceListSchema)
    },
    enabled: !!classId,
    refetchInterval,
    refetchIntervalInBackground: false,
  })
}

/** N most recent days of class attendance for the history page. */
export function useClassAttendanceRange(classId: string | undefined, days = 30) {
  return useQuery({
    queryKey: classId
      ? ['attendance', 'class', classId, 'range', days]
      : ['attendance', 'class', 'range', 'none'],
    queryFn: () => {
      // Date math lives inside queryFn (effect-time) — calling Date.now()
      // in the render body trips react-hooks/purity.
      const today = dateStrInKarachi()
      const from = dateStrInKarachi(new Date(Date.now() - (days - 1) * 86400000))
      return apiGet(`/attendance?classId=${classId}&from=${from}&to=${today}`, attendanceListSchema)
    },
    enabled: !!classId,
    staleTime: 60_000,
  })
}

interface ManualTapInput {
  studentId: string
  direction: TapDirection
  occurredAt: string
  reason: string
}

export function useManualTapMutation() {
  const client = useQueryClient()
  return useMutation<TapEvent, Error, ManualTapInput>({
    mutationFn: (input) => apiPost('/tap-events/manual', input, tapEventSchema),
    onSuccess: () => {
      // The override updates today's AttendanceRecord and tap-events stream;
      // invalidate broadly so every consuming view refreshes.
      void client.invalidateQueries({ queryKey: ['attendance'] })
      void client.invalidateQueries({ queryKey: ['tapEvents'] })
    },
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
