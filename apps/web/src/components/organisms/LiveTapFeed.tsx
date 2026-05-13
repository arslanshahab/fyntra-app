import { ArrowDownLeft, ArrowUpRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Icon } from '../atoms/Icon'
import { Spinner } from '../atoms/Spinner'
import { useLiveTapFeed } from '../../features/attendance/queries'
import { useDevicesQuery } from '../../features/devices/queries'
import { useStudentsQuery } from '../../features/students/queries'
import type { School } from '../../types/schemas'
import { formatTimeInKarachi } from '../../utils/datetime'

interface LiveTapFeedProps {
  school: School | undefined
}

export function LiveTapFeed({ school }: LiveTapFeedProps) {
  const { t } = useTranslation()
  const feed = useLiveTapFeed(school)
  const students = useStudentsQuery()
  const devices = useDevicesQuery()

  const studentsByCard = new Map(
    (students.data ?? []).filter((s) => s.cardId).map((s) => [s.cardId!, s]),
  )
  const devicesById = new Map((devices.data ?? []).map((d) => [d.id, d]))
  const events = [...(feed.data ?? [])]
    .sort((a, b) => (a.occurredAt < b.occurredAt ? 1 : -1))
    .slice(0, 20)

  return (
    <section
      aria-live="polite"
      aria-label={t('admin.liveFeed.title')}
      className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200"
    >
      <h2 className="text-sm font-semibold text-slate-900">{t('admin.liveFeed.title')}</h2>
      <div className="mt-4">
        {feed.isLoading ? (
          <div role="status" aria-label={t('common.loading')} className="py-6 text-center">
            <Spinner />
          </div>
        ) : feed.isError ? (
          <p
            role="alert"
            className="rounded-lg bg-status-alarm/10 px-3 py-2 text-sm text-status-alarm"
          >
            {t('admin.liveFeed.loadError')}
          </p>
        ) : events.length === 0 ? (
          <p className="text-sm text-slate-500">{t('admin.liveFeed.empty')}</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {events.map((event) => {
              const student = studentsByCard.get(event.cardId)
              const device = devicesById.get(event.deviceId)
              const isIn = event.direction === 'in'
              return (
                <li key={event.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                  <span
                    aria-hidden="true"
                    className={
                      isIn
                        ? 'flex h-8 w-8 items-center justify-center rounded-full bg-status-present/10 text-status-present'
                        : 'flex h-8 w-8 items-center justify-center rounded-full bg-status-notyet/10 text-status-notyet'
                    }
                  >
                    <Icon icon={isIn ? ArrowDownLeft : ArrowUpRight} size="sm" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-900">
                      {student?.fullName ?? t('admin.unknownStudent')}
                    </p>
                    <p className="truncate text-xs text-slate-500">
                      {isIn ? t('admin.liveFeed.in') : t('admin.liveFeed.out')}
                      {' · '}
                      {device?.label ?? event.deviceId}
                    </p>
                  </div>
                  <span className="flex-shrink-0 text-xs tabular-nums text-slate-500">
                    {formatTimeInKarachi(event.occurredAt)}
                  </span>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </section>
  )
}
