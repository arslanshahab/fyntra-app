import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '../atoms/Button'
import { useSimulateTapMutation } from '../../features/devices/mutations'
import { useReaderBridge, type BridgeStatus } from '../../hooks/useReaderBridge'
import type { Device, TapDirection } from '@fyntra/schemas'
import { cn } from '../../utils/cn'

interface SimulateTapPanelProps {
  devices: Device[]
}

const statusDot: Record<BridgeStatus, string> = {
  connected: 'bg-status-present',
  connecting: 'bg-status-late',
  disconnected: 'bg-status-alarm',
}

export function SimulateTapPanel({ devices }: SimulateTapPanelProps) {
  const { t } = useTranslation()
  const bridge = useReaderBridge()
  const mutation = useSimulateTapMutation()

  const [uid, setUid] = useState('')
  const [direction, setDirection] = useState<TapDirection>('in')
  const [deviceId, setDeviceId] = useState<string>(devices[0]?.id ?? '')
  const [banner, setBanner] = useState<{ kind: 'success' | 'error'; text: string } | null>(null)

  // Sync external sources into local state. Both blocks mirror data
  // owned outside the component (the bridge socket + the devices list)
  // back into the form's editable values, so useEffect is the right tool
  // even though react-hooks/set-state-in-effect would prefer a refactor.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (bridge.lastScan) setUid(bridge.lastScan.uid)
  }, [bridge.lastScan])

  useEffect(() => {
    if (devices.length > 0 && !devices.find((d) => d.id === deviceId)) {
      setDeviceId(devices[0]!.id)
    }
  }, [devices, deviceId])
  /* eslint-enable react-hooks/set-state-in-effect */

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!uid || !deviceId) return
    setBanner(null)
    mutation.mutate(
      { rfidUid: uid.toUpperCase(), deviceId, direction },
      {
        onSuccess: () => {
          setBanner({ kind: 'success', text: t('admin.simulate.success') })
          setUid('')
        },
        onError: () => setBanner({ kind: 'error', text: t('admin.simulate.error') }),
      },
    )
  }

  return (
    <section className="rounded-2xl bg-white p-5 shadow-elev-1 ring-1 ring-stone-200">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-display text-base font-semibold tracking-tight text-stone-900">
          {t('admin.simulate.title')}
        </h2>
        <div className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className={cn('h-2 w-2 rounded-full', statusDot[bridge.status])}
          />
          <span className="text-xs font-medium text-stone-600">
            {t(`admin.simulate.bridge.${bridge.status}`)}
          </span>
        </div>
      </div>

      <p className="mt-2 text-xs leading-relaxed text-stone-500">
        {t('admin.simulate.help', { url: bridge.url })}
      </p>

      <form noValidate className="mt-4 space-y-4" onSubmit={submit}>
        <div>
          <label htmlFor="sim-uid" className="block text-sm font-medium text-stone-700">
            {t('admin.simulate.uidLabel')}
          </label>
          <input
            id="sim-uid"
            type="text"
            value={uid}
            onChange={(e) => setUid(e.target.value.toUpperCase())}
            placeholder="AABBCCDD"
            autoComplete="off"
            className="mt-1.5 block h-11 w-full rounded-lg border border-stone-300 bg-white px-3 font-mono text-sm uppercase tracking-wider text-stone-900 placeholder:text-stone-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="block text-sm font-medium text-stone-700">
              {t('admin.simulate.directionLabel')}
            </p>
            <div className="mt-1.5 grid grid-cols-2 gap-1 rounded-lg bg-stone-100 p-1">
              {(['in', 'out'] as const).map((opt) => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => setDirection(opt)}
                  aria-pressed={direction === opt}
                  className={
                    direction === opt
                      ? 'rounded-md bg-white px-3 py-1.5 text-sm font-medium text-stone-900 shadow-elev-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-500'
                      : 'rounded-md px-3 py-1.5 text-sm font-medium text-stone-600 transition-colors hover:text-stone-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-500'
                  }
                >
                  {t(`admin.simulate.direction.${opt}`)}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label htmlFor="sim-device" className="block text-sm font-medium text-stone-700">
              {t('admin.simulate.deviceLabel')}
            </label>
            <select
              id="sim-device"
              value={deviceId}
              onChange={(e) => setDeviceId(e.target.value)}
              className="mt-1.5 block h-11 w-full rounded-lg border border-stone-300 bg-white px-3 text-sm text-stone-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
            >
              {devices.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.label}
                </option>
              ))}
            </select>
          </div>
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

        <Button
          type="submit"
          className="w-full"
          isLoading={mutation.isPending}
          disabled={!uid || !deviceId || mutation.isPending}
        >
          {t('admin.simulate.submit')}
        </Button>
      </form>
    </section>
  )
}
