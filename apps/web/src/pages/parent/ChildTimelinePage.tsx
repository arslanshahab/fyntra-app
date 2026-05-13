import { useState } from 'react'
import { ChevronLeft } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams } from 'react-router-dom'

import { Badge } from '../../components/atoms/Badge'
import { Button } from '../../components/atoms/Button'
import { Icon } from '../../components/atoms/Icon'
import { Spinner } from '../../components/atoms/Spinner'
import { useDayTapEvents, useStudentTimeline } from '../../features/attendance/queries'
import { useMeQuery } from '../../features/auth/queries'
import { useDevicesQuery } from '../../features/devices/queries'
import type { AttendanceRecord } from '../../types/schemas'
import { formatTimeInKarachi, formatTimelineDate } from '../../utils/datetime'

const statusTone: Record<AttendanceRecord['status'], 'present' | 'late' | 'absent' | 'notyet'> = {
  present: 'present',
  late: 'late',
  absent: 'absent',
  left_early: 'late',
}

interface DayRowProps {
  record: AttendanceRecord
  studentId: string
  isOpen: boolean
  onToggle: () => void
}

function DayRow({ record, studentId, isOpen, onToggle }: DayRowProps) {
  const { t } = useTranslation()
  const dayEvents = useDayTapEvents(studentId, isOpen ? record.date : undefined)
  const devicesQuery = useDevicesQuery()
  const devicesById = new Map((devicesQuery.data ?? []).map((d) => [d.id, d]))

  return (
    <li className="overflow-hidden rounded-xl bg-white ring-1 ring-slate-200">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isOpen}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-500"
      >
        <div className="min-w-0">
          <p className="text-sm font-medium text-slate-900">{formatTimelineDate(record.date)}</p>
          <p className="mt-0.5 text-xs text-slate-500">
            {record.firstInAt ? formatTimeInKarachi(record.firstInAt) : '—'}
            {' / '}
            {record.lastOutAt ? formatTimeInKarachi(record.lastOutAt) : '—'}
          </p>
        </div>
        <Badge tone={statusTone[record.status]}>{t(`timeline.statusLabel.${record.status}`)}</Badge>
      </button>

      {isOpen ? (
        <div className="border-t border-slate-100 bg-slate-50/60 px-4 py-3">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            {t('timeline.dayDetail', { date: formatTimelineDate(record.date) })}
          </p>
          {dayEvents.isLoading ? (
            <div className="py-4">
              <Spinner size="sm" />
            </div>
          ) : dayEvents.data && dayEvents.data.length > 0 ? (
            <ul className="mt-2 space-y-1.5">
              {dayEvents.data.map((event) => (
                <li
                  key={event.id}
                  className="flex items-center justify-between rounded-md bg-white px-3 py-2 text-sm ring-1 ring-slate-200"
                >
                  <span className="font-medium text-slate-700">
                    {t(`timeline.${event.direction}`)}
                    {' · '}
                    <span className="font-normal text-slate-500">
                      {formatTimeInKarachi(event.occurredAt)}
                    </span>
                  </span>
                  <span className="truncate text-xs text-slate-500">
                    {t('timeline.atDevice', {
                      device: devicesById.get(event.deviceId)?.label ?? event.deviceId,
                    })}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-slate-500">{t('timeline.noEventsForDay')}</p>
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
  const timeline = useStudentTimeline(id)
  const [openDate, setOpenDate] = useState<string | null>(null)

  const child = me.data?.children?.find((c) => c.id === id)

  return (
    <main className="min-h-dvh bg-slate-50">
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-md items-center gap-2 px-3 py-3">
          <button
            type="button"
            onClick={() => navigate('/parent')}
            aria-label={t('common.back')}
            className="rounded-md p-2 text-slate-600 hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
          >
            <Icon icon={ChevronLeft} size="md" className="rtl:rotate-180" />
          </button>
          <p className="truncate text-sm font-semibold text-slate-900">
            {child ? t('timeline.heading', { name: child.fullName }) : t('common.loading')}
          </p>
        </div>
      </header>

      <div className="mx-auto max-w-md space-y-3 p-5">
        {timeline.isLoading ? (
          <div
            role="status"
            aria-label={t('common.loading')}
            className="flex items-center justify-center rounded-2xl bg-white p-12 ring-1 ring-slate-200"
          >
            <Spinner />
          </div>
        ) : timeline.isError ? (
          <div
            role="alert"
            className="rounded-2xl bg-status-alarm/10 p-5 text-sm text-status-alarm"
          >
            <p className="font-medium">{t('timeline.loadError')}</p>
            <Button
              variant="secondary"
              size="sm"
              className="mt-3"
              onClick={() => void timeline.refetch()}
            >
              {t('common.retry')}
            </Button>
          </div>
        ) : !timeline.data || timeline.data.length === 0 ? (
          <p className="rounded-2xl bg-white p-6 text-sm text-slate-500 ring-1 ring-slate-200">
            {t('timeline.empty')}
          </p>
        ) : (
          <ul className="space-y-2">
            {timeline.data.map((record) => (
              <DayRow
                key={record.id}
                record={record}
                studentId={id!}
                isOpen={openDate === record.date}
                onToggle={() => setOpenDate((prev) => (prev === record.date ? null : record.date))}
              />
            ))}
          </ul>
        )}
      </div>
    </main>
  )
}
