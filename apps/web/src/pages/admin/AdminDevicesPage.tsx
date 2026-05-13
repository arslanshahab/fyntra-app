import { useTranslation } from 'react-i18next'
import { formatDistanceToNow } from 'date-fns'

import { Spinner } from '../../components/atoms/Spinner'
import { SimulateTapPanel } from '../../components/organisms/SimulateTapPanel'
import { useDevicesQuery } from '../../features/devices/queries'
import { cn } from '../../utils/cn'

export function AdminDevicesPage() {
  const { t } = useTranslation()
  const devices = useDevicesQuery()

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-xl font-semibold text-slate-900">{t('admin.devices.pageTitle')}</h1>
      </header>

      {devices.isLoading ? (
        <div
          role="status"
          aria-label={t('common.loading')}
          className="flex items-center justify-center rounded-2xl bg-white p-12 shadow-sm ring-1 ring-slate-200"
        >
          <Spinner />
        </div>
      ) : !devices.data || devices.data.length === 0 ? (
        <p className="rounded-2xl bg-white p-6 text-sm text-slate-500 shadow-sm ring-1 ring-slate-200">
          {t('admin.devices.empty')}
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {devices.data.map((device) => {
            const online = device.status === 'online'
            return (
              <article
                key={device.id}
                className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="truncate text-base font-semibold text-slate-900">
                      {device.label}
                    </h2>
                    <p className="mt-0.5 text-xs uppercase tracking-wide text-slate-500">
                      {t(`admin.devices.direction.${device.direction}`)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      aria-hidden="true"
                      className={cn(
                        'h-2.5 w-2.5 rounded-full',
                        online ? 'bg-status-present' : 'bg-status-alarm',
                      )}
                    />
                    <span
                      className={
                        online
                          ? 'text-xs font-medium text-status-present'
                          : 'text-xs font-medium text-status-alarm'
                      }
                    >
                      {online ? t('admin.devices.online') : t('admin.devices.offline')}
                    </span>
                  </div>
                </div>
                <dl className="mt-4 grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <dt className="font-medium uppercase tracking-wide text-slate-500">
                      {t('admin.devices.idLabel')}
                    </dt>
                    <dd className="mt-0.5 font-mono text-slate-700">{device.id}</dd>
                  </div>
                  <div>
                    <dt className="font-medium uppercase tracking-wide text-slate-500">
                      {t('admin.devices.lastSeenLabel')}
                    </dt>
                    <dd className="mt-0.5 text-slate-700">
                      {formatDistanceToNow(new Date(device.lastHeartbeat), { addSuffix: true })}
                    </dd>
                  </div>
                </dl>
              </article>
            )
          })}
        </div>
      )}

      {devices.data ? <SimulateTapPanel devices={devices.data} /> : null}
    </div>
  )
}
