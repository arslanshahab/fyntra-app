import { useMemo } from 'react'
import { LogIn, LogOut } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '../atoms/Button'
import { Icon } from '../atoms/Icon'
import { useLiveTapFeed } from '../../features/attendance/queries'
import { useDevicesQuery } from '../../features/devices/queries'
import { useStudentsQuery } from '../../features/students/queries'
import type { School, TapEvent } from '@fyntra/schemas'
import { dateStrInKarachi, formatTimeInKarachi, formatTimelineDate } from '../../utils/datetime'

interface LiveTapFeedProps {
  school: School | undefined
}

interface FeedBucket {
  key: string // 'justNow' | 'earlierToday' | 'yesterday' | YYYY-MM-DD
  events: TapEvent[]
}

const JUST_NOW_THRESHOLD_MS = 5 * 60 * 1000

function bucketKeyFor(occurredAt: string, now: Date): string {
  const eventDate = new Date(occurredAt)
  if (now.getTime() - eventDate.getTime() < JUST_NOW_THRESHOLD_MS) return 'justNow'

  const today = dateStrInKarachi(now)
  const yesterday = dateStrInKarachi(new Date(now.getTime() - 86400000))
  const eventDay = dateStrInKarachi(eventDate)

  if (eventDay === today) return 'earlierToday'
  if (eventDay === yesterday) return 'yesterday'
  return eventDay
}

function groupByBucket(events: TapEvent[], now: Date): FeedBucket[] {
  const buckets = new Map<string, TapEvent[]>()
  for (const event of events) {
    const key = bucketKeyFor(event.occurredAt, now)
    const arr = buckets.get(key)
    if (arr) arr.push(event)
    else buckets.set(key, [event])
  }
  return [...buckets.entries()].map(([key, evs]) => ({ key, events: evs }))
}

export function LiveTapFeed({ school }: LiveTapFeedProps) {
  const { t } = useTranslation()
  const feed = useLiveTapFeed(school)
  const students = useStudentsQuery()
  const devices = useDevicesQuery()

  const studentsByCard = new Map(
    (students.data ?? []).filter((s) => s.cardId).map((s) => [s.cardId!, s]),
  )
  const studentsById = new Map((students.data ?? []).map((s) => [s.id, s]))
  const devicesById = new Map((devices.data ?? []).map((d) => [d.id, d]))

  const allEvents = (feed.data?.pages ?? []).flatMap((p) => p.data)
  const events = useMemo(
    () => [...allEvents].sort((a, b) => (a.occurredAt < b.occurredAt ? 1 : -1)),
    [allEvents],
  )
  const buckets = useMemo(() => groupByBucket(events, new Date()), [events])

  const bucketLabel = (key: FeedBucket['key']) => {
    if (key === 'justNow') return t('admin.liveFeed.bucket.justNow')
    if (key === 'earlierToday') return t('admin.liveFeed.bucket.earlierToday')
    if (key === 'yesterday') return t('admin.liveFeed.bucket.yesterday')
    return formatTimelineDate(key)
  }

  return (
    <section
      aria-live="polite"
      aria-label={t('admin.liveFeed.title')}
      className="rounded-2xl bg-white p-5 shadow-elev-1 ring-1 ring-stone-200"
    >
      <h2 className="font-display text-base font-semibold tracking-tight text-stone-900">
        {t('admin.liveFeed.title')}
      </h2>
      <div className="mt-4">
        {feed.isLoading ? (
          <div aria-busy="true" aria-label={t('common.loading')}>
            <div className="h-3 w-20 rounded bg-stone-100" />
            <ul className="mt-3 animate-pulse divide-y divide-stone-100">
              {Array.from({ length: 4 }).map((_, i) => (
                <li key={i} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                  <div className="h-8 w-8 flex-shrink-0 rounded-full bg-stone-100" />
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <div className="h-3.5 w-32 rounded bg-stone-100" />
                    <div className="h-3 w-40 rounded bg-stone-100" />
                  </div>
                  <div className="h-3 w-12 flex-shrink-0 rounded bg-stone-100" />
                </li>
              ))}
            </ul>
          </div>
        ) : feed.isError ? (
          <p
            role="alert"
            className="rounded-lg bg-status-alarm/10 px-3 py-2 text-sm text-status-alarm ring-1 ring-status-alarm/20"
          >
            {t('admin.liveFeed.loadError')}
          </p>
        ) : events.length === 0 ? (
          <p className="text-sm text-stone-500">{t('admin.liveFeed.empty')}</p>
        ) : (
          <>
            <div className="space-y-5">
              {buckets.map((bucket) => (
                <div key={bucket.key}>
                  <h3 className="text-micro font-semibold uppercase text-stone-500">
                    {bucketLabel(bucket.key)}
                  </h3>
                  <ul className="mt-2 divide-y divide-stone-100">
                    {bucket.events.map((event) => {
                      const student =
                        (event.studentId ? studentsById.get(event.studentId) : undefined) ??
                        (event.cardId ? studentsByCard.get(event.cardId) : undefined)
                      const device = event.deviceId ? devicesById.get(event.deviceId) : undefined
                      const isIn = event.direction === 'in'
                      return (
                        <li
                          key={event.id}
                          className="flex items-center gap-3 py-3 first:pt-0 last:pb-0 motion-safe:animate-fade-in-up"
                        >
                          <span
                            aria-hidden="true"
                            className={
                              isIn
                                ? 'flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-status-present/10 text-status-present'
                                : 'flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-status-notyet/15 text-status-notyet'
                            }
                          >
                            <Icon icon={isIn ? LogIn : LogOut} size="sm" />
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium text-stone-900">
                              {student?.fullName ?? t('admin.unknownStudent')}
                            </p>
                            <p className="truncate text-xs text-stone-500">
                              {isIn ? t('admin.liveFeed.in') : t('admin.liveFeed.out')}
                              {' · '}
                              {device?.label ??
                                (event.source === 'manual'
                                  ? t('admin.liveFeed.manualEntry')
                                  : event.deviceId
                                    ? t('admin.liveFeed.removedDevice')
                                    : '—')}
                            </p>
                          </div>
                          <span className="flex-shrink-0 font-mono text-xs tabular-nums text-stone-500">
                            {formatTimeInKarachi(event.occurredAt)}
                          </span>
                        </li>
                      )
                    })}
                  </ul>
                </div>
              ))}
            </div>
            <div className="mt-4 flex items-center justify-center">
              {feed.hasNextPage ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => void feed.fetchNextPage()}
                  disabled={feed.isFetchingNextPage}
                  isLoading={feed.isFetchingNextPage}
                >
                  {t('admin.liveFeed.loadMore')}
                </Button>
              ) : (
                <p className="text-xs text-stone-400">{t('admin.liveFeed.endOfList')}</p>
              )}
            </div>
          </>
        )}
      </div>
    </section>
  )
}
