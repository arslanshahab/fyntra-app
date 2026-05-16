import { useState } from 'react'
import { Radio } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { formatDistanceToNow } from 'date-fns'

import { Badge } from '../../components/atoms/Badge'
import { Button } from '../../components/atoms/Button'
import { Input } from '../../components/atoms/Input'
import { Modal } from '../../components/molecules/Modal'
import { StatusCard } from '../../components/molecules/StatusCard'
import { SimulateTapPanel } from '../../components/organisms/SimulateTapPanel'
import { useCreateDevice, useDevicesQuery } from '../../features/devices/queries'
import { ApiError } from '../../services/api/client'
import { cn } from '../../utils/cn'
import type { Device } from '@fyntra/schemas'

type DeviceDirection = Device['direction']
const DIRECTIONS: DeviceDirection[] = ['in', 'out', 'both']

function DeviceRowSkeleton() {
  return (
    <tr aria-hidden="true" className="animate-pulse">
      <td className="px-4 py-3">
        <div className="h-3.5 w-28 rounded bg-stone-100" />
      </td>
      <td className="px-4 py-3">
        <div className="h-3.5 w-14 rounded bg-stone-100" />
      </td>
      <td className="px-4 py-3">
        <div className="h-5 w-16 rounded-full bg-stone-100" />
      </td>
      <td className="hidden px-4 py-3 md:table-cell">
        <div className="h-3.5 w-20 rounded bg-stone-100" />
      </td>
    </tr>
  )
}

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
            err instanceof ApiError
              ? `${t('admin.devices.actionError')} (${err.status})`
              : t('admin.devices.actionError')
          setBanner({ kind: 'error', text: msg })
        },
      },
    )
  }

  return (
    <div className="space-y-5">
      <header className="flex items-baseline justify-between gap-2">
        <h1 className="font-display text-2xl font-semibold tracking-tight text-stone-900">
          {t('admin.devices.pageTitle')}
        </h1>
        <Button onClick={() => setShowCreate(true)} size="sm">
          {t('admin.devices.newButton')}
        </Button>
      </header>

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

      {devices.isError ? (
        <p
          role="alert"
          className="rounded-lg bg-status-alarm/10 px-3 py-2 text-sm text-status-alarm ring-1 ring-status-alarm/20"
        >
          {t('admin.devices.loadError')}
        </p>
      ) : null}

      {!devices.isLoading && (!devices.data || devices.data.length === 0) ? (
        <StatusCard icon={Radio} body={t('admin.devices.empty')} />
      ) : (
        <div className="overflow-hidden rounded-2xl bg-white shadow-elev-1 ring-1 ring-stone-200">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-stone-200 text-sm">
              <thead className="bg-stone-50 text-micro uppercase text-stone-500">
                <tr>
                  <th scope="col" className="px-4 py-3 text-left font-semibold">
                    {t('admin.devices.labelHeader')}
                  </th>
                  <th scope="col" className="px-4 py-3 text-left font-semibold">
                    {t('admin.devices.directionHeader')}
                  </th>
                  <th scope="col" className="px-4 py-3 text-left font-semibold">
                    {t('admin.devices.statusHeader')}
                  </th>
                  <th
                    scope="col"
                    className="hidden px-4 py-3 text-left font-semibold md:table-cell"
                  >
                    {t('admin.devices.lastSeenHeader')}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {devices.isLoading
                  ? Array.from({ length: 4 }).map((_, i) => <DeviceRowSkeleton key={i} />)
                  : (devices.data ?? []).map((device) => {
                      const online = device.status === 'online'
                      return (
                        <tr key={device.id} className="transition-colors hover:bg-stone-50">
                          <td className="px-4 py-3">
                            <Link
                              to={`/admin/devices/${device.id}`}
                              className="rounded font-medium text-brand-700 transition-colors hover:text-brand-800 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                            >
                              {device.label}
                            </Link>
                          </td>
                          <td className="px-4 py-3 text-stone-700">
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
                              <Badge tone={online ? 'present' : 'absent'}>
                                {online ? t('admin.devices.online') : t('admin.devices.offline')}
                              </Badge>
                            </span>
                          </td>
                          <td className="hidden px-4 py-3 font-mono text-xs tabular-nums text-stone-500 md:table-cell">
                            {formatDistanceToNow(new Date(device.lastHeartbeat), {
                              addSuffix: true,
                            })}
                          </td>
                        </tr>
                      )
                    })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {devices.data ? <SimulateTapPanel devices={devices.data} /> : null}

      {showCreate ? (
        <Modal label={t('admin.devices.create.title')}>
          <h2 className="font-display text-lg font-semibold tracking-tight text-stone-900">
            {t('admin.devices.create.title')}
          </h2>
          <label className="mt-5 block text-sm font-medium text-stone-700">
            {t('admin.devices.create.labelLabel')}
            <Input
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              maxLength={80}
              placeholder={t('admin.devices.create.labelPlaceholder')}
              className="mt-1.5"
            />
          </label>
          <fieldset className="mt-5">
            <legend className="text-sm font-medium text-stone-700">
              {t('admin.devices.create.directionLabel')}
            </legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {DIRECTIONS.map((d) => (
                <label
                  key={d}
                  className={cn(
                    'cursor-pointer rounded-full px-3 py-1.5 text-sm font-medium ring-1 ring-inset transition-colors',
                    newDirection === d
                      ? 'bg-brand-50 text-brand-700 ring-brand-200'
                      : 'bg-white text-stone-600 ring-stone-200 hover:bg-stone-50',
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
        </Modal>
      ) : null}
    </div>
  )
}
