import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'

import { apiGet, apiPost } from '../../services/api/client'
import { useCursorList } from '../pagination/useCursorList'
import { useRealtime } from '../../hooks/useRealtime'
import {
  attendanceRecordSchema,
  tapEventSchema,
  type School,
  type Student,
  type TapDirection,
  type TapEvent,
  type TapEventReasonKind,
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

// Shared query shape so single- and multi-student callers hit the same cache.
function todayAttendanceQueryFn(studentId: string) {
  return async () => {
    const today = dateStrInKarachi()
    const rows = await apiGet(
      `/students/${studentId}/timeline?from=${today}&to=${today}`,
      attendanceListSchema,
    )
    return rows[0] ?? null
  }
}

/** Today's attendance row for a student. Polls inside the school window. */
export function useTodayAttendance(studentId: string | undefined, school: School | undefined) {
  const { refetchInterval } = useRealtime(school)
  return useQuery({
    queryKey: studentId
      ? attendanceKeys.todayByStudent(studentId)
      : ['attendance', 'today', 'none'],
    queryFn: studentId ? todayAttendanceQueryFn(studentId) : async () => null,
    enabled: !!studentId,
    refetchInterval,
    refetchIntervalInBackground: false,
  })
}

/**
 * Fan-out variant: today's attendance for every supplied student in parallel.
 * Shares the same cache keys as useTodayAttendance, so the cache is hot when
 * a parent navigates from the home page into a single child's timeline.
 */
export function useChildrenTodayAttendance(students: Student[], school: School | undefined) {
  const { refetchInterval } = useRealtime(school)
  return useQueries({
    queries: students.map((s) => ({
      queryKey: attendanceKeys.todayByStudent(s.id),
      queryFn: todayAttendanceQueryFn(s.id),
      enabled: !!school,
      refetchInterval,
      refetchIntervalInBackground: false,
    })),
  })
}

/**
 * Last N days of AttendanceRecord rows for a student, newest first.
 *
 * The parent timeline "Load earlier" UI bumps `days` in 30-day chunks instead
 * of using a cursor — /students/:id/timeline does not support cursor pagination
 * as of Phase 2.1.
 */
export function useStudentTimeline(studentId: string | undefined, days = 30) {
  return useQuery({
    queryKey: studentId
      ? [...attendanceKeys.timelineByStudent(studentId), days]
      : ['attendance', 'timeline', 'none', days],
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

/**
 * Today's tap events, newest-first, cursor-paginated. Backs the admin live feed.
 *
 * Note: useInfiniteQuery does not compose cleanly with refetchInterval for
 * incremental pages — instead we rely on WS-driven invalidation of the
 * ['tapEvents'] queryKey (see useRealtime) plus the existing mutation
 * invalidation paths. Calling refetch() will reset to the first page only.
 */
export function useLiveTapFeed(school: School | undefined) {
  // Subscribe so WS-driven invalidation is wired up even though we don't use
  // its polling interval here.
  useRealtime(school)
  return useCursorList({
    queryKey: [...attendanceKeys.liveFeed],
    path: (cursor) => {
      const today = dateStrInKarachi()
      const params = new URLSearchParams({
        from: `${today}T00:00:00.000+05:00`,
        to: `${today}T23:59:59.999+05:00`,
        limit: '100',
      })
      if (cursor) params.set('cursor', cursor)
      return `/tap-events?${params.toString()}`
    },
    schema: tapEventListSchema,
    staleTime: 5_000,
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
  reasonKind: TapEventReasonKind
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
function dayTapsQueryFn(studentId: string, date: string) {
  return () =>
    apiGet(
      `/tap-events?studentId=${studentId}&from=${date}T00:00:00.000%2B05:00&to=${date}T23:59:59.999%2B05:00`,
      tapEventListSchema,
    )
}

export function useDayTapEvents(studentId: string | undefined, date: string | undefined) {
  return useQuery({
    queryKey:
      studentId && date ? attendanceKeys.tapsByStudentDay(studentId, date) : ['taps', 'none'],
    queryFn: studentId && date ? dayTapsQueryFn(studentId, date) : async () => [],
    enabled: !!studentId && !!date,
    staleTime: 60_000,
  })
}

/**
 * Fan-out variant: today's tap events for every supplied student. ParentHomePage
 * uses this to look up the device label of each child's most recent tap.
 */
export function useChildrenTodayTaps(students: Student[]) {
  const today = dateStrInKarachi()
  return useQueries({
    queries: students.map((s) => ({
      queryKey: attendanceKeys.tapsByStudentDay(s.id, today),
      queryFn: dayTapsQueryFn(s.id, today),
      staleTime: 60_000,
    })),
  })
}
