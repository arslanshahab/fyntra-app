import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { formatDistanceToNow } from 'date-fns'

import { Button } from '../../components/atoms/Button'
import { Input } from '../../components/atoms/Input'
import { Spinner } from '../../components/atoms/Spinner'
import { SimulateTapPanel } from '../../components/organisms/SimulateTapPanel'
import { useCreateDevice, useDevicesQuery } from '../../features/devices/queries'
import { ApiError } from '../../services/api/client'
import { cn } from '../../utils/cn'
import type { Device } from '@fyntra/schemas'

type DeviceDirection = Device['direction']
const DIRECTIONS: DeviceDirection[] = ['in', 'out', 'both']

export function AdminDevicesPage() {
  const { t } = useTranslation()
  const devices = useDevicesQuery()
  const createDevice = useCreateDevice()

  const [showCreate, setShowCreate] = useState(false)
  const [newLabel, setNewLabel] = useState('')
  const [newDirection, setNewDirection] = useState<DeviceDirection>('both')
  const [banner, setBanner] = useState<{ kind: 'success' | 'error'; text: string } | null>(null)

  const resetCreateForm = () => {
    setNewLabel('')
    setNewDirection('both')
  }

  const submitCreate = () => {
    setBanner(null)
    const trimmed = newLabel.trim()
    if (trimmed.length < 1 || trimmed.length > 80) {
      setBanner({ kind: 'error', text: t('admin.devices.actionError') })
      return
    }
    createDevice.mutate(
      { label: trimmed, direction: newDirection },
      {
        onSuccess: () => {
          setBanner({ kind: 'success', text: t('admin.devices.createSuccess') })
          setShowCreate(false)
          resetCreateForm()
        },
        onError: (err) => {
          const msg =
            err instanceof ApiError ? `${t('admin.devices.actionError')} (${err.status})` : t('admin.devices.actionError')
          setBanner({ kind: 'error', text: msg })
        },
      },
    )
  }

  return (
    <div className="space-y-4">
      <header className="flex items-baseline justify-between gap-2">
        <h1 className="text-xl font-semibold text-slate-900">{t('admin.devices.pageTitle')}</h1>
        <Button onClick={() => setShowCreate(true)} size="sm">
          {t('admin.devices.newButton')}
        </Button>
      </header>

      {banner ? (
        <div
          role={banner.kind === 'error' ? 'alert' : 'status'}
          className={
            banner.kind === 'success'
              ? 'rounded-lg bg-status-present/10 px-3 py-2 text-sm text-status-present'
              : 'rounded-lg bg-status-alarm/10 px-3 py-2 text-sm text-status-alarm'
          }
        >
          {banner.text}
        </div>
      ) : null}

      {devices.isError ? (
        <p
          role="alert"
          className="rounded-lg bg-status-alarm/10 px-3 py-2 text-sm text-status-alarm"
        >
          {t('admin.devices.loadError')}
        </p>
      ) : null}

      <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
        {devices.isLoading ? (
          <div role="status" aria-label={t('common.loading')} className="p-12 text-center">
            <Spinner />
          </div>
        ) : !devices.data || devices.data.length === 0 ? (
          <p className="p-8 text-center text-sm text-slate-500">{t('admin.devices.empty')}</p>
        ) : (
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th scope="col" className="px-4 py-3 text-left font-medium">
                  {t('admin.devices.labelHeader')}
                </th>
                <th scope="col" className="px-4 py-3 text-left font-medium">
                  {t('admin.devices.directionHeader')}
                </th>
                <th scope="col" className="px-4 py-3 text-left font-medium">
                  {t('admin.devices.statusHeader')}
                </th>
                <th scope="col" className="hidden px-4 py-3 text-left font-medium md:table-cell">
                  {t('admin.devices.lastSeenHeader')}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {devices.data.map((device) => {
                const online = device.status === 'online'
                return (
                  <tr key={device.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <Link
                        to={`/admin/devices/${device.id}`}
                        className="font-medium text-brand-700 hover:text-brand-800 hover:underline focus:outline-none focus-visible:rounded focus-visible:ring-2 focus-visible:ring-brand-500"
                      >
                        {device.label}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {t(`admin.devices.direction.${device.direction}`)}
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-2">
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
                      </span>
                    </td>
                    <td className="hidden px-4 py-3 text-slate-500 md:table-cell">
                      {formatDistanceToNow(new Date(device.lastHeartbeat), { addSuffix: true })}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {devices.data ? <SimulateTapPanel devices={devices.data} /> : null}

      {showCreate ? (
        <div
          role="dialog"
          aria-label={t('admin.devices.create.title')}
          className="fixed inset-0 z-20 flex items-center justify-center bg-slate-900/40 p-4"
        >
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="text-lg font-semibold text-slate-900">
              {t('admin.devices.create.title')}
            </h2>
            <label className="mt-4 block text-sm font-medium text-slate-700">
              {t('admin.devices.create.labelLabel')}
              <Input
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                maxLength={80}
                placeholder={t('admin.devices.create.labelPlaceholder')}
                className="mt-1"
              />
            </label>
            <fieldset className="mt-4">
              <legend className="text-sm font-medium text-slate-700">
                {t('admin.devices.create.directionLabel')}
              </legend>
              <div className="mt-2 flex flex-wrap gap-2">
                {DIRECTIONS.map((d) => (
                  <label
                    key={d}
                    className={cn(
                      'cursor-pointer rounded-full px-3 py-1.5 text-sm ring-1 ring-inset',
                      newDirection === d
                        ? 'bg-brand-50 text-brand-700 ring-brand-200'
                        : 'bg-white text-slate-600 ring-slate-200 hover:bg-slate-50',
                    )}
                  >
                    <input
                      type="radio"
                      name="device-direction"
                      value={d}
                      checked={newDirection === d}
                      onChange={() => setNewDirection(d)}
                      className="sr-only"
                    />
                    {t(`admin.devices.direction.${d}`)}
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="mt-6 flex justify-end gap-2">
              <Button
                variant="ghost"
                onClick={() => {
                  setShowCreate(false)
                  resetCreateForm()
                }}
              >
                {t('common.cancel')}
              </Button>
              <Button
                onClick={submitCreate}
                isLoading={createDevice.isPending}
                disabled={createDevice.isPending || newLabel.trim().length === 0}
              >
                {t('admin.devices.create.submit')}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
