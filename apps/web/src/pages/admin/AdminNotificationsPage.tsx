import { useState } from 'react'
import { Bell } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { formatDistanceToNow } from 'date-fns'

import { Badge } from '../../components/atoms/Badge'
import { Button } from '../../components/atoms/Button'
import { StatusCard } from '../../components/molecules/StatusCard'
import {
  useNotificationsQuery,
  useRetryNotificationMutation,
} from '../../features/notifications/queries'
import type { NotificationLog } from '@fyntra/schemas'

type StatusFilter = '' | NotificationLog['status']

const STATUS_FILTERS: Array<{ value: StatusFilter; key: string }> = [
  { value: '', key: 'admin.notificationsLog.filter.all' },
  { value: 'queued', key: 'admin.notificationsLog.status.queued' },
  { value: 'sent', key: 'admin.notificationsLog.status.sent' },
  { value: 'delivered', key: 'admin.notificationsLog.status.delivered' },
  { value: 'failed', key: 'admin.notificationsLog.status.failed' },
]

const statusTone: Record<NotificationLog['status'], 'present' | 'late' | 'absent' | 'notyet'> = {
  queued: 'notyet',
  sent: 'late',
  delivered: 'present',
  failed: 'absent',
}

export function AdminNotificationsPage() {
  const { t } = useTranslation()
  const [status, setStatus] = useState<StatusFilter>('')
  const [banner, setBanner] = useState<{ kind: 'success' | 'error'; text: string } | null>(null)

  const list = useNotificationsQuery({ status: status || undefined })
  const retry = useRetryNotificationMutation()

  const onRetry = (id: string) => {
    setBanner(null)
    retry.mutate(
      { id },
      {
        onSuccess: () =>
          setBanner({ kind: 'success', text: t('admin.notificationsLog.retrySuccess') }),
        onError: () => setBanner({ kind: 'error', text: t('admin.notificationsLog.retryError') }),
      },
    )
  }

  return (
    <div className="space-y-5">
      <header className="flex items-baseline justify-between gap-2">
        <h1 className="font-display text-2xl font-semibold tracking-tight text-stone-900">
          {t('admin.notificationsLog.title')}
        </h1>
        {list.data ? (
          <span className="font-mono text-sm tabular-nums text-stone-500">
            {t('admin.notificationsLog.count', { count: list.data.length })}
          </span>
        ) : null}
      </header>

      <div className="flex flex-wrap gap-2">
        {STATUS_FILTERS.map((f) => (
          <button
            key={f.value || 'all'}
            type="button"
            onClick={() => setStatus(f.value)}
            className={
              status === f.value
                ? 'rounded-full bg-brand-50 px-3 py-1.5 text-sm font-medium text-brand-700 ring-1 ring-inset ring-brand-100 transition-colors'
                : 'rounded-full bg-white px-3 py-1.5 text-sm font-medium text-stone-600 ring-1 ring-inset ring-stone-200 transition-colors hover:bg-stone-50'
            }
          >
            {t(f.key)}
          </button>
        ))}
      </div>

      {banner ? (
        <div
          role={banner.kind === 'error' ? 'alert' : 'status'}
          className={
            banner.kind === 'success'
              ? 'rounded-lg bg-status-present/10 px-3 py-2 text-sm text-status-present ring-1 ring-status-present/20'
              : 'rounded-lg bg-status-alarm/10 px-3 py-2 text-sm text-status-alarm ring-1 ring-status-alarm/20'
          }
        >
          {banner.text}
        </div>
      ) : null}

      {list.isLoading ? (
        <div
          aria-busy="true"
          aria-label={t('common.loading')}
          className="overflow-hidden rounded-2xl bg-white shadow-elev-1 ring-1 ring-stone-200"
        >
          <ul className="animate-pulse divide-y divide-stone-100">
            {Array.from({ length: 5 }).map((_, i) => (
              <li key={i} className="px-4 py-3 sm:px-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 space-y-1.5">
                    <div className="flex gap-2">
                      <div className="h-5 w-16 rounded-full bg-stone-100" />
                      <div className="h-5 w-14 rounded bg-stone-100" />
                      <div className="h-5 w-20 rounded bg-stone-100" />
                    </div>
                    <div className="h-3.5 w-2/3 rounded bg-stone-100" />
                    <div className="h-3 w-1/2 rounded bg-stone-100" />
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : !list.data || list.data.length === 0 ? (
        <StatusCard icon={Bell} body={t('admin.notificationsLog.empty')} />
      ) : (
        <div className="overflow-hidden rounded-2xl bg-white shadow-elev-1 ring-1 ring-stone-200">
          <ul className="divide-y divide-stone-100">
            {list.data.map((n) => (
              <li key={n.id} className="px-4 py-3 sm:px-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={statusTone[n.status]}>
                        {t(`admin.notificationsLog.status.${n.status}`)}
                      </Badge>
                      <span className="text-micro font-medium uppercase text-stone-500">
                        {t(`admin.notificationsLog.channel.${n.channel}`)}
                      </span>
                      <span className="font-mono text-xs tabular-nums text-stone-400">
                        {n.sentAt
                          ? formatDistanceToNow(new Date(n.sentAt), { addSuffix: true })
                          : '—'}
                      </span>
                    </div>
                    <p className="mt-1 text-sm font-medium text-stone-900">{n.payload.title}</p>
                    <p className="mt-0.5 truncate text-xs text-stone-600">{n.payload.body}</p>
                  </div>
                  {n.status === 'failed' ? (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => onRetry(n.id)}
                      isLoading={retry.isPending && retry.variables?.id === n.id}
                    >
                      {t('admin.notificationsLog.retry')}
                    </Button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
