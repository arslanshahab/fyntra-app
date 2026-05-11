import { useTranslation } from 'react-i18next'
import { formatDistanceToNow } from 'date-fns'

import { Spinner } from '../atoms/Spinner'
import { useDevicesQuery } from '../../features/devices/queries'
import { cn } from '../../utils/cn'

export function DeviceStatusList() {
  const { t } = useTranslation()
  const devices = useDevicesQuery()

  return (
    <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
      <h2 className="text-sm font-semibold text-slate-900">{t('admin.devices.title')}</h2>
      <div className="mt-4">
        {devices.isLoading ? (
          <div role="status" aria-label={t('common.loading')} className="py-4 text-center">
            <Spinner size="sm" />
          </div>
        ) : !devices.data || devices.data.length === 0 ? (
          <p className="text-sm text-slate-500">{t('admin.devices.empty')}</p>
        ) : (
          <ul className="space-y-3">
            {devices.data.map((device) => {
              const online = device.status === 'online'
              return (
                <li key={device.id} className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span
                      aria-hidden="true"
                      className={cn(
                        'h-2.5 w-2.5 rounded-full',
                        online ? 'bg-status-present' : 'bg-status-alarm',
                      )}
                    />
                    <span className="text-sm font-medium text-slate-900">{device.label}</span>
                  </div>
                  <div className="text-right">
                    <p
                      className={cn(
                        'text-xs font-medium',
                        online ? 'text-status-present' : 'text-status-alarm',
                      )}
                    >
                      {online ? t('admin.devices.online') : t('admin.devices.offline')}
                    </p>
                    <p className="text-[11px] text-slate-500">
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
