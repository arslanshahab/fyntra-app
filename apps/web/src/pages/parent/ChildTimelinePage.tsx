import { useEffect, useRef, useState } from 'react'
import { AlertTriangle, CalendarX, ChevronDown, ChevronLeft, LogIn, LogOut } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams } from 'react-router-dom'

import { Badge } from '../../components/atoms/Badge'
import { Button } from '../../components/atoms/Button'
import { Icon } from '../../components/atoms/Icon'
import { Spinner } from '../../components/atoms/Spinner'
import { StatusCard } from '../../components/molecules/StatusCard'
import { cn } from '../../utils/cn'
import { useDayTapEvents, useStudentTimeline } from '../../features/attendance/queries'
import { useMeQuery } from '../../features/auth/queries'
import { useDevicesQuery } from '../../features/devices/queries'
import type { AttendanceRecord, TapEvent } from '@fyntra/schemas'
import { formatTimeInKarachi, formatTimelineDate, relativeDayPrefix } from '../../utils/datetime'

const statusTone: Record<AttendanceRecord['status'], 'present' | 'late' | 'absent' | 'notyet'> = {
  present: 'present',
  late: 'late',
  absent: 'absent',
  left_early: 'late',
  half_day: 'late',
  unverified: 'notyet',
}

interface DayRowProps {
  record: AttendanceRecord
  studentId: string
  isOpen: boolean
  onToggle: () => void
}

function DayRowSkeleton() {
  return (
    <div
      aria-hidden="true"
      className="animate-pulse rounded-2xl bg-white p-4 shadow-elev-1 ring-1 ring-stone-200"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="space-y-1.5">
          <div className="h-3.5 w-32 rounded bg-stone-100" />
          <div className="h-3 w-24 rounded bg-stone-100" />
        </div>
        <div className="h-6 w-16 rounded-full bg-stone-100" />
      </div>
    </div>
  )
}

function EventRow({
  event,
  deviceLabel,
  t,
}: {
  event: TapEvent
  deviceLabel: string
  t: (key: string, opts?: Record<string, unknown>) => string
}) {
  const isIn = event.direction === 'in'
  return (
    <li className="flex items-center gap-3 rounded-xl bg-white px-3 py-2.5 ring-1 ring-stone-200">
      <span
        aria-hidden="true"
        className={cn(
          'flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full',
          isIn
            ? 'bg-status-present/10 text-status-present'
            : 'bg-status-notyet/15 text-status-notyet',
        )}
      >
        {isIn ? <LogIn className="h-3.5 w-3.5" /> : <LogOut className="h-3.5 w-3.5" />}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-stone-900">
          {t(`timeline.${event.direction}`)}
          <span className="mx-1.5 text-stone-300">·</span>
          <span className="font-mono tabular-nums text-stone-700">
            {formatTimeInKarachi(event.occurredAt)}
          </span>
        </p>
        <p className="truncate text-xs text-stone-500">{deviceLabel}</p>
      </div>
    </li>
  )
}

function DayRow({ record, studentId, isOpen, onToggle }: DayRowProps) {
  const { t } = useTranslation()
  const dayEvents = useDayTapEvents(studentId, isOpen ? record.date : undefined)
  const devicesQuery = useDevicesQuery()
  const devicesById = new Map((devicesQuery.data ?? []).map((d) => [d.id, d]))

  const timeRange = record.firstInAt || record.lastOutAt
    ? `${record.firstInAt ? formatTimeInKarachi(record.firstInAt) : '—'} · ${
        record.lastOutAt ? formatTimeInKarachi(record.lastOutAt) : '—'
      }`
    : null
  const relPrefix = relativeDayPrefix(record.date)

  return (
    <li className="overflow-hidden rounded-2xl bg-white shadow-elev-1 ring-1 ring-stone-200">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isOpen}
        className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left transition-colors hover:bg-stone-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-500"
      >
        <div className="min-w-0">
          <p className="text-sm">
            {relPrefix ? (
              <>
                <span className="font-semibold text-stone-900">
                  {t(`timeline.relativeDay.${relPrefix}`)}
                </span>
                <span aria-hidden="true" className="mx-1.5 text-stone-300">
                  ·
                </span>
                <span className="font-medium text-stone-500">
                  {formatTimelineDate(record.date)}
                </span>
              </>
            ) : (
              <span className="font-medium text-stone-900">
                {formatTimelineDate(record.date)}
              </span>
            )}
          </p>
          {timeRange ? (
            <p className="mt-0.5 font-mono text-xs tabular-nums text-stone-500">{timeRange}</p>
          ) : null}
        </div>
        <div className="flex flex-shrink-0 items-center gap-2">
          <Badge tone={statusTone[record.status]}>
            {t(`timeline.statusLabel.${record.status}`)}
          </Badge>
          <Icon
            icon={ChevronDown}
            size="sm"
            className={cn(
              'text-stone-400 transition-transform duration-200',
              isOpen && 'rotate-180',
            )}
          />
        </div>
      </button>

      {isOpen ? (
        <div className="border-t border-stone-100 bg-stone-50 px-4 py-3">
          <p className="text-micro font-medium uppercase text-stone-500">
            {t('timeline.dayDetail', { date: formatTimelineDate(record.date) })}
          </p>
          {dayEvents.isLoading ? (
            <div className="flex justify-center py-4">
              <Spinner size="sm" />
            </div>
          ) : dayEvents.data && dayEvents.data.length > 0 ? (
            <ul className="mt-2.5 space-y-1.5">
              {dayEvents.data.map((event) => {
                const deviceLabel = t('timeline.atDevice', {
                  device:
                    (event.deviceId ? devicesById.get(event.deviceId)?.label : undefined) ??
                    (event.deviceId ? t('timeline.removedDevice') : '—'),
                })
                return (
                  <EventRow key={event.id} event={event} deviceLabel={deviceLabel} t={t} />
                )
              })}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-stone-500">{t('timeline.noEventsForDay')}</p>
          )}
        </div>
      ) : null}
    </li>
  )
}

export function ChildTimelinePage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { id } = useParams<{ id: string }>()
  const me = useMeQuery()
  // Date-window pagination — /students/:id/timeline does not support cursor
  // pagination as of Phase 2.1, so each "Load earlier" click expands the
  // window by 30 days instead.
  const [days, setDays] = useState(30)
  const timeline = useStudentTimeline(id, days)
  const [openDate, setOpenDate] = useState<string | null>(null)

  // When two consecutive window expansions return the same row count, the
  // user has reached the beginning of recorded history — hide the button.
  const prevCountRef = useRef<number | null>(null)
  const [endOfHistory, setEndOfHistory] = useState(false)
  useEffect(() => {
    if (!timeline.isSuccess) return
    const count = timeline.data?.length ?? 0
    if (prevCountRef.current !== null && count === prevCountRef.current) {
      setEndOfHistory(true)
    }
    prevCountRef.current = count
  }, [timeline.data, timeline.isSuccess])

  const child = me.data?.children?.find((c) => c.id === id)

  return (
    <main className="min-h-dvh bg-stone-50">
      <header className="sticky top-0 z-10 border-b border-stone-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-md items-center gap-2 px-3 py-3">
          <button
            type="button"
            onClick={() => navigate('/parent')}
            aria-label={t('common.back')}
            className="rounded-md p-2 text-stone-600 transition-colors hover:bg-stone-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
          >
            <Icon icon={ChevronLeft} size="md" className="rtl:rotate-180" />
          </button>
          <p className="truncate font-display text-base font-semibold tracking-tight text-stone-900">
            {child ? t('timeline.heading', { name: child.fullName }) : t('common.loading')}
          </p>
        </div>
      </header>

      <div className="mx-auto max-w-md space-y-3 px-5 pb-10 pt-6">
        {timeline.isLoading ? (
          <ul className="space-y-3" aria-busy="true">
            {Array.from({ length: 4 }).map((_, i) => (
              <li key={i}>
                <DayRowSkeleton />
              </li>
            ))}
          </ul>
        ) : timeline.isError ? (
          <StatusCard
            tone="alarm"
            icon={AlertTriangle}
            body={t('timeline.loadError')}
            action={{
              label: t('common.retry'),
              onClick: () => void timeline.refetch(),
            }}
          />
        ) : !timeline.data || timeline.data.length === 0 ? (
          <StatusCard icon={CalendarX} body={t('timeline.empty')} />
        ) : (
          <>
            <ul className="space-y-2.5">
              {timeline.data.map((record) => (
                <DayRow
                  key={record.id}
                  record={record}
                  studentId={id!}
                  isOpen={openDate === record.date}
                  onToggle={() =>
                    setOpenDate((prev) => (prev === record.date ? null : record.date))
                  }
                />
              ))}
            </ul>
            <div className="flex items-center justify-center pt-2">
              {endOfHistory ? (
                <p className="text-xs text-stone-400">{t('timeline.endOfHistory')}</p>
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setDays((d) => d + 30)}
                  disabled={timeline.isFetching}
                  isLoading={timeline.isFetching}
                >
                  {t('timeline.loadEarlier')}
                </Button>
              )}
            </div>
          </>
        )}
      </div>
    </main>
  )
}
