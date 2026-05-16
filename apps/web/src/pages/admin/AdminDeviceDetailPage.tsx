import { useState } from 'react'
import { ChevronLeft } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams } from 'react-router-dom'
import { format } from 'date-fns'

import { Badge } from '../../components/atoms/Badge'
import { Button } from '../../components/atoms/Button'
import { Icon } from '../../components/atoms/Icon'
import { Input } from '../../components/atoms/Input'
import { Spinner } from '../../components/atoms/Spinner'
import {
  useDeleteDevice,
  useDeviceQuery,
  useDeviceTokensQuery,
  useIssueDeviceToken,
  usePatchDevice,
  useRevokeDeviceToken,
  type IssueDeviceTokenResponse,
} from '../../features/devices/queries'
import { ApiError } from '../../services/api/client'
import { cn } from '../../utils/cn'
import type { Device, DeviceToken } from '@fyntra/schemas'

type DeviceDirection = Device['direction']
const DIRECTIONS: DeviceDirection[] = ['in', 'out', 'both']

export function AdminDeviceDetailPage() {
  const { t } = useTranslation()
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const deviceQuery = useDeviceQuery(id)
  const tokensQuery = useDeviceTokensQuery(id)
  const patchDevice = usePatchDevice(id ?? '')
  const deleteDevice = useDeleteDevice()
  const issueToken = useIssueDeviceToken(id ?? '')
  const revokeToken = useRevokeDeviceToken(id ?? '')

  const [labelDraft, setLabelDraft] = useState('')
  const [directionDraft, setDirectionDraft] = useState<DeviceDirection>('both')
  const [banner, setBanner] = useState<{ kind: 'success' | 'error'; text: string } | null>(null)
  const [showDelete, setShowDelete] = useState(false)
  const [showIssue, setShowIssue] = useState(false)
  const [issueLabel, setIssueLabel] = useState('')
  const [issued, setIssued] = useState<IssueDeviceTokenResponse | null>(null)
  const [copied, setCopied] = useState(false)
  const [revoking, setRevoking] = useState<DeviceToken | null>(null)

  // Seed the editable fields the first time the device id we're rendering
  // changes. This is the canonical React pattern for "adjusting state on
  // prop change" — setState in render is fine when guarded by a tracked
  // previous value (https://react.dev/learn/you-might-not-need-an-effect).
  const [seededId, setSeededId] = useState<string | null>(null)
  if (deviceQuery.data && seededId !== deviceQuery.data.id) {
    setSeededId(deviceQuery.data.id)
    setLabelDraft(deviceQuery.data.label)
    setDirectionDraft(deviceQuery.data.direction)
  }

  if (!id) return null

  const device = deviceQuery.data
  const isDirty =
    device !== undefined && (labelDraft !== device.label || directionDraft !== device.direction)

  const reportError = (err: unknown, fallbackKey: string) => {
    const text =
      err instanceof ApiError ? `${t(fallbackKey)} (${err.status})` : t(fallbackKey)
    setBanner({ kind: 'error', text })
  }

  const submitSave = () => {
    if (!device || !isDirty) return
    setBanner(null)
    const trimmed = labelDraft.trim()
    if (trimmed.length < 1 || trimmed.length > 80) {
      setBanner({ kind: 'error', text: t('admin.devices.detail.saveError') })
      return
    }
    patchDevice.mutate(
      { label: trimmed, direction: directionDraft },
      {
        onSuccess: () => setBanner({ kind: 'success', text: t('admin.devices.updateSuccess') }),
        onError: (err) => reportError(err, 'admin.devices.detail.saveError'),
      },
    )
  }

  const submitDelete = () => {
    if (!device) return
    setBanner(null)
    deleteDevice.mutate(device.id, {
      onSuccess: () => {
        setShowDelete(false)
        navigate('/admin/devices')
      },
      onError: (err) => {
        setShowDelete(false)
        reportError(err, 'admin.devices.detail.deleteError')
      },
    })
  }

  const submitIssue = () => {
    const trimmed = issueLabel.trim()
    if (trimmed.length < 1 || trimmed.length > 80) return
    setBanner(null)
    issueToken.mutate(
      { label: trimmed },
      {
        onSuccess: (res) => {
          setIssued(res)
          setIssueLabel('')
          setCopied(false)
        },
        onError: (err) => reportError(err, 'admin.devices.tokens.issue.error'),
      },
    )
  }

  const closeIssueModal = () => {
    setShowIssue(false)
    setIssued(null)
    setIssueLabel('')
    setCopied(false)
  }

  const copyToken = async () => {
    if (!issued) return
    try {
      await navigator.clipboard.writeText(issued.token)
      setCopied(true)
    } catch {
      // Clipboard API can fail in insecure contexts / test envs — fall back
      // silently. The plaintext is still visible in the modal.
    }
  }

  const submitRevoke = () => {
    if (!revoking) return
    setBanner(null)
    revokeToken.mutate(revoking.id, {
      onSuccess: () => setRevoking(null),
      onError: (err) => {
        setRevoking(null)
        reportError(err, 'admin.devices.tokens.revoke.error')
      },
    })
  }

  return (
    <div className="space-y-5">
      <button
        type="button"
        onClick={() => navigate('/admin/devices')}
        className="inline-flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900"
      >
        <Icon icon={ChevronLeft} size="sm" className="rtl:rotate-180" />
        {t('admin.devices.back')}
      </button>

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

      {deviceQuery.isLoading ? (
        <div
          role="status"
          aria-label={t('common.loading')}
          className="flex items-center justify-center rounded-2xl bg-white p-12 shadow-sm ring-1 ring-slate-200"
        >
          <Spinner />
        </div>
      ) : deviceQuery.isError || !device ? (
        <p
          role="alert"
          className="rounded-lg bg-status-alarm/10 px-3 py-2 text-sm text-status-alarm"
        >
          {t('admin.devices.loadError')}
        </p>
      ) : (
        <>
          <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
            <h1 className="text-lg font-semibold text-slate-900">{t('admin.devices.detail.title')}</h1>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <label className="block text-sm font-medium text-slate-700">
                {t('admin.devices.detail.labelLabel')}
                <Input
                  value={labelDraft}
                  onChange={(e) => setLabelDraft(e.target.value)}
                  maxLength={80}
                  className="mt-1"
                />
              </label>
              <label className="block text-sm font-medium text-slate-700">
                {t('admin.devices.detail.directionLabel')}
                <select
                  value={directionDraft}
                  onChange={(e) => setDirectionDraft(e.target.value as DeviceDirection)}
                  className="mt-1 block h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                >
                  {DIRECTIONS.map((d) => (
                    <option key={d} value={d}>
                      {t(`admin.devices.direction.${d}`)}
                    </option>
                  ))}
                </select>
              </label>
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
                  {t('admin.devices.statusHeader')}
                </dt>
                <dd className="mt-0.5">
                  <span
                    className={
                      device.status === 'online'
                        ? 'text-xs font-medium text-status-present'
                        : 'text-xs font-medium text-status-alarm'
                    }
                  >
                    {device.status === 'online'
                      ? t('admin.devices.online')
                      : t('admin.devices.offline')}
                  </span>
                </dd>
              </div>
            </dl>
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <Button
                variant="destructive"
                onClick={() => setShowDelete(true)}
                disabled={deleteDevice.isPending}
              >
                {t('admin.devices.detail.deleteButton')}
              </Button>
              <Button
                onClick={submitSave}
                isLoading={patchDevice.isPending}
                disabled={!isDirty || patchDevice.isPending || labelDraft.trim().length === 0}
              >
                {t('common.save')}
              </Button>
            </div>
          </section>

          <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-slate-900">
                  {t('admin.devices.tokens.heading')}
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  {t('admin.devices.tokens.subheading')}
                </p>
              </div>
              <Button size="sm" onClick={() => setShowIssue(true)}>
                {t('admin.devices.tokens.issueButton')}
              </Button>
            </div>
            <div className="mt-4 overflow-hidden rounded-xl ring-1 ring-slate-200">
              {tokensQuery.isLoading ? (
                <div role="status" aria-label={t('common.loading')} className="p-8 text-center">
                  <Spinner size="sm" />
                </div>
              ) : tokensQuery.isError ? (
                <p role="alert" className="p-4 text-sm text-status-alarm">
                  {t('admin.devices.tokens.loadError')}
                </p>
              ) : !tokensQuery.data || tokensQuery.data.length === 0 ? (
                <p className="p-6 text-center text-sm text-slate-500">
                  {t('admin.devices.tokens.empty')}
                </p>
              ) : (
                <table className="min-w-full divide-y divide-slate-200 text-sm">
                  <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th scope="col" className="px-4 py-3 text-left font-medium">
                        {t('admin.devices.tokens.table.label')}
                      </th>
                      <th scope="col" className="px-4 py-3 text-left font-medium">
                        {t('admin.devices.tokens.table.created')}
                      </th>
                      <th scope="col" className="px-4 py-3 text-left font-medium">
                        {t('admin.devices.tokens.table.revoked')}
                      </th>
                      <th scope="col" className="px-4 py-3 text-right font-medium">
                        {t('admin.devices.tokens.table.actions')}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {tokensQuery.data.map((token) => (
                      <tr key={token.id} className="hover:bg-slate-50">
                        <td className="px-4 py-3 font-medium text-slate-800">{token.label}</td>
                        <td className="px-4 py-3 text-slate-600">
                          {format(new Date(token.createdAt), 'MMM d, yyyy · h:mm a')}
                        </td>
                        <td className="px-4 py-3">
                          {token.revokedAt ? (
                            <span className="text-slate-600">
                              {format(new Date(token.revokedAt), 'MMM d, yyyy · h:mm a')}
                            </span>
                          ) : (
                            <Badge tone="present">{t('admin.devices.tokens.active')}</Badge>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {token.revokedAt ? null : (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setRevoking(token)}
                              disabled={revokeToken.isPending}
                            >
                              {t('admin.devices.tokens.revokeAction')}
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </section>
        </>
      )}

      {showDelete && device ? (
        <div
          role="dialog"
          aria-label={t('admin.devices.detail.deleteTitle')}
          className="fixed inset-0 z-20 flex items-center justify-center bg-slate-900/40 p-4"
        >
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="text-lg font-semibold text-slate-900">
              {t('admin.devices.detail.deleteTitle')}
            </h2>
            <p className="mt-2 text-sm text-slate-600">
              {t('admin.devices.detail.deleteBody', { label: device.label })}
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setShowDelete(false)}>
                {t('common.cancel')}
              </Button>
              <Button
                variant="destructive"
                onClick={submitDelete}
                isLoading={deleteDevice.isPending}
                disabled={deleteDevice.isPending}
              >
                {t('admin.devices.detail.deleteConfirm')}
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {showIssue ? (
        <div
          role="dialog"
          aria-label={t('admin.devices.tokens.issue.title')}
          className="fixed inset-0 z-20 flex items-center justify-center bg-slate-900/40 p-4"
        >
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            {issued ? (
              <>
                <h2 className="text-lg font-semibold text-slate-900">
                  {t('admin.devices.tokens.issue.successTitle')}
                </h2>
                <p className="mt-2 text-sm text-slate-600">
                  {t('admin.devices.tokens.issue.successBody')}
                </p>
                <label className="mt-4 block text-sm font-medium text-slate-700">
                  {t('admin.devices.tokens.issue.tokenLabel')}
                  <div className="mt-1 flex items-stretch gap-2">
                    <code
                      data-testid="plaintext-token"
                      className="flex-1 break-all rounded-lg bg-slate-50 px-3 py-2 font-mono text-xs text-slate-800 ring-1 ring-slate-200"
                    >
                      {issued.token}
                    </code>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => void copyToken()}
                      className={cn(copied && 'text-status-present')}
                    >
                      {copied ? t('admin.devices.tokens.issue.copied') : t('admin.devices.tokens.issue.copy')}
                    </Button>
                  </div>
                </label>
                <div
                  role="alert"
                  className="mt-4 rounded-lg bg-status-notyet/10 px-3 py-2 text-xs text-slate-700"
                >
                  {t('admin.devices.tokens.issue.successBody')}
                </div>
                <div className="mt-5 flex justify-end">
                  <Button onClick={closeIssueModal}>
                    {t('admin.devices.tokens.issue.done')}
                  </Button>
                </div>
              </>
            ) : (
              <>
                <h2 className="text-lg font-semibold text-slate-900">
                  {t('admin.devices.tokens.issue.title')}
                </h2>
                <p className="mt-1 text-sm text-slate-600">
                  {t('admin.devices.tokens.issue.body')}
                </p>
                <label className="mt-4 block text-sm font-medium text-slate-700">
                  {t('admin.devices.tokens.issue.labelLabel')}
                  <Input
                    value={issueLabel}
                    onChange={(e) => setIssueLabel(e.target.value)}
                    maxLength={80}
                    placeholder={t('admin.devices.tokens.issue.labelPlaceholder')}
                    className="mt-1"
                  />
                </label>
                <div className="mt-5 flex justify-end gap-2">
                  <Button variant="ghost" onClick={closeIssueModal}>
                    {t('common.cancel')}
                  </Button>
                  <Button
                    onClick={submitIssue}
                    isLoading={issueToken.isPending}
                    disabled={issueToken.isPending || issueLabel.trim().length === 0}
                  >
                    {t('admin.devices.tokens.issue.submit')}
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>
      ) : null}

      {revoking ? (
        <div
          role="dialog"
          aria-label={t('admin.devices.tokens.revoke.title')}
          className="fixed inset-0 z-20 flex items-center justify-center bg-slate-900/40 p-4"
        >
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="text-lg font-semibold text-slate-900">
              {t('admin.devices.tokens.revoke.title')}
            </h2>
            <p className="mt-2 text-sm text-slate-600">
              {t('admin.devices.tokens.revoke.body', { label: revoking.label })}
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setRevoking(null)}>
                {t('common.cancel')}
              </Button>
              <Button
                variant="destructive"
                onClick={submitRevoke}
                isLoading={revokeToken.isPending}
                disabled={revokeToken.isPending}
              >
                {t('admin.devices.tokens.revoke.confirm')}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
