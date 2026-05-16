import { useTranslation } from 'react-i18next'
import { formatDistanceToNow } from 'date-fns'

import { Badge } from '../atoms/Badge'
import { useDevicesQuery } from '../../features/devices/queries'
import { cn } from '../../utils/cn'

function DeviceRowSkeleton() {
  return (
    <li
      aria-hidden="true"
      className="flex animate-pulse items-center justify-between gap-3 py-2"
    >
      <div className="flex items-center gap-3">
        <div className="h-3 w-3 rounded-full bg-stone-100" />
        <div className="h-3.5 w-28 rounded bg-stone-100" />
      </div>
      <div className="space-y-1">
        <div className="h-3 w-12 rounded bg-stone-100" />
        <div className="h-2.5 w-16 rounded bg-stone-100" />
      </div>
    </li>
  )
}

export function DeviceStatusList() {
  const { t } = useTranslation()
  const devices = useDevicesQuery()

  return (
    <section className="rounded-2xl bg-white p-5 shadow-elev-1 ring-1 ring-stone-200">
      <h2 className="font-display text-base font-semibold tracking-tight text-stone-900">
        {t('admin.devices.title')}
      </h2>
      <div className="mt-4">
        {devices.isLoading ? (
          <ul className="space-y-3" aria-busy="true">
            {Array.from({ length: 3 }).map((_, i) => (
              <DeviceRowSkeleton key={i} />
            ))}
          </ul>
        ) : !devices.data || devices.data.length === 0 ? (
          <p className="text-sm text-stone-500">{t('admin.devices.empty')}</p>
        ) : (
          <ul className="space-y-3">
            {devices.data.map((device) => {
              const online = device.status === 'online'
              return (
                <li key={device.id} className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <span
                      aria-hidden="true"
                      className={cn(
                        'h-2.5 w-2.5 flex-shrink-0 rounded-full',
                        online ? 'bg-status-present' : 'bg-status-alarm',
                      )}
                    />
                    <span className="truncate text-sm font-medium text-stone-900">
                      {device.label}
                    </span>
                  </div>
                  <div className="flex flex-shrink-0 flex-col items-end gap-0.5">
                    <Badge tone={online ? 'present' : 'absent'}>
                      {online ? t('admin.devices.online') : t('admin.devices.offline')}
                    </Badge>
                    <p className="font-mono text-[10px] tabular-nums text-stone-500">
                      {t('admin.devices.lastHeartbeat', {
                        time: formatDistanceToNow(new Date(device.lastHeartbeat), {
                          addSuffix: true,
                        }),
                      })}
                    </p>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </section>
  )
}
