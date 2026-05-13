import { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { format } from 'date-fns'

import { Badge } from '../../components/atoms/Badge'
import { Button } from '../../components/atoms/Button'
import { Icon } from '../../components/atoms/Icon'
import { Spinner } from '../../components/atoms/Spinner'
import {
  usePatchCardStatusMutation,
  useReplaceCardMutation,
  useCardsQuery,
} from '../../features/cards/queries'
import { useStudentsQuery } from '../../features/students/queries'
import type { Card, CardStatus } from '@fyntra/schemas'

const statusTone: Record<CardStatus, 'present' | 'late' | 'absent' | 'notyet' | 'neutral'> = {
  active: 'present',
  lost: 'absent',
  replaced: 'neutral',
  deactivated: 'notyet',
}

const STATUS_FILTERS: Array<{ value: '' | CardStatus; key: string }> = [
  { value: '', key: 'admin.cards.filter.all' },
  { value: 'active', key: 'admin.cards.status.active' },
  { value: 'lost', key: 'admin.cards.status.lost' },
  { value: 'replaced', key: 'admin.cards.status.replaced' },
  { value: 'deactivated', key: 'admin.cards.status.deactivated' },
]

export function AdminCardsPage() {
  const { t } = useTranslation()
  const [statusFilter, setStatusFilter] = useState<'' | CardStatus>('')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [replacingCard, setReplacingCard] = useState<Card | null>(null)
  const [replaceUid, setReplaceUid] = useState('')
  const [banner, setBanner] = useState<{ kind: 'success' | 'error'; text: string } | null>(null)

  const cards = useCardsQuery({ status: statusFilter || undefined })
  const students = useStudentsQuery()
  const patchStatus = usePatchCardStatusMutation()
  const replace = useReplaceCardMutation()

  const studentsById = new Map((students.data ?? []).map((s) => [s.id, s]))
  const usersById = new Map<string, string>() // Phase 1: only system or admin ids; show id

  const runStatusChange = (id: string, status: CardStatus, successMsg: string) => {
    setBanner(null)
    patchStatus.mutate(
      { id, status },
      {
        onSuccess: () => setBanner({ kind: 'success', text: successMsg }),
        onError: () => setBanner({ kind: 'error', text: t('admin.cards.error') }),
      },
    )
  }

  const runReplace = () => {
    if (!replacingCard?.studentId || !replaceUid) return
    setBanner(null)
    replace.mutate(
      { studentId: replacingCard.studentId, newRfidUid: replaceUid },
      {
        onSuccess: () => {
          setBanner({ kind: 'success', text: t('admin.cards.replaceSuccess') })
          setReplacingCard(null)
          setReplaceUid('')
        },
        onError: () => setBanner({ kind: 'error', text: t('admin.cards.error') }),
      },
    )
  }

  return (
    <div className="space-y-4">
      <header className="flex items-baseline justify-between gap-2">
        <h1 className="text-xl font-semibold text-slate-900">{t('admin.cards.title')}</h1>
        {cards.data ? (
          <span className="text-sm text-slate-500">
            {t('admin.cards.count', { count: cards.data.length })}
          </span>
        ) : null}
      </header>

      <div className="flex flex-wrap gap-2">
        {STATUS_FILTERS.map((f) => (
          <button
            key={f.value || 'all'}
            type="button"
            onClick={() => setStatusFilter(f.value)}
            className={
              statusFilter === f.value
                ? 'rounded-full bg-brand-50 px-3 py-1 text-sm font-medium text-brand-700 ring-1 ring-inset ring-brand-100'
                : 'rounded-full bg-white px-3 py-1 text-sm font-medium text-slate-600 ring-1 ring-inset ring-slate-200 hover:bg-slate-50'
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
              ? 'rounded-lg bg-status-present/10 px-3 py-2 text-sm text-status-present'
              : 'rounded-lg bg-status-alarm/10 px-3 py-2 text-sm text-status-alarm'
          }
        >
          {banner.text}
        </div>
      ) : null}

      <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
        {cards.isLoading ? (
          <div role="status" aria-label={t('common.loading')} className="p-12 text-center">
            <Spinner />
          </div>
        ) : !cards.data || cards.data.length === 0 ? (
          <p className="p-8 text-center text-sm text-slate-500">{t('admin.cards.empty')}</p>
        ) : (
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th scope="col" className="w-8 px-2 py-3" />
                <th scope="col" className="px-4 py-3 text-left font-medium">
                  {t('admin.cards.table.uid')}
                </th>
                <th scope="col" className="hidden px-4 py-3 text-left font-medium md:table-cell">
                  {t('admin.cards.table.student')}
                </th>
                <th scope="col" className="px-4 py-3 text-left font-medium">
                  {t('admin.cards.table.status')}
                </th>
                <th scope="col" className="px-4 py-3 text-right font-medium">
                  {t('admin.cards.table.actions')}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {cards.data.map((card) => {
                const student = card.studentId ? studentsById.get(card.studentId) : undefined
                const isExpanded = expandedId === card.id
                return (
                  <>
                    <tr key={card.id} className="hover:bg-slate-50">
                      <td className="px-2 py-3">
                        <button
                          type="button"
                          onClick={() => setExpandedId(isExpanded ? null : card.id)}
                          aria-expanded={isExpanded}
                          aria-label={t('admin.cards.toggleHistory')}
                          className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                        >
                          <Icon icon={isExpanded ? ChevronDown : ChevronRight} size="sm" />
                        </button>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-700">{card.rfidUid}</td>
                      <td className="hidden px-4 py-3 text-slate-700 md:table-cell">
                        {student?.fullName ?? '—'}
                      </td>
                      <td className="px-4 py-3">
                        <Badge tone={statusTone[card.status]}>
                          {t(`admin.cards.status.${card.status}`)}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-1.5">
                          {card.status === 'active' ? (
                            <>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setReplacingCard(card)}
                                disabled={!card.studentId}
                              >
                                {t('admin.cards.actions.replace')}
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() =>
                                  runStatusChange(card.id, 'lost', t('admin.cards.lostSuccess'))
                                }
                              >
                                {t('admin.cards.actions.markLost')}
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() =>
                                  runStatusChange(
                                    card.id,
                                    'deactivated',
                                    t('admin.cards.deactivateSuccess'),
                                  )
                                }
                              >
                                {t('admin.cards.actions.deactivate')}
                              </Button>
                            </>
                          ) : card.status === 'lost' || card.status === 'deactivated' ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() =>
                                runStatusChange(
                                  card.id,
                                  'active',
                                  t('admin.cards.reactivateSuccess'),
                                )
                              }
                            >
                              {t('admin.cards.actions.reactivate')}
                            </Button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                    {isExpanded ? (
                      <tr key={`${card.id}-audit`}>
                        <td colSpan={5} className="bg-slate-50 px-4 py-3">
                          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">
                            {t('admin.cards.auditTitle')}
                          </p>
                          <ul className="space-y-1.5 text-xs text-slate-600">
                            {[...card.auditLog].reverse().map((entry, idx) => (
                              <li
                                key={`${card.id}-${idx}`}
                                className="flex items-baseline justify-between gap-3"
                              >
                                <div className="min-w-0">
                                  <span className="font-medium text-slate-800">
                                    {t(`admin.cards.audit.${entry.action}`)}
                                  </span>
                                  {entry.note ? (
                                    <span className="ml-2 text-slate-500">{entry.note}</span>
                                  ) : null}
                                </div>
                                <span className="flex-shrink-0 tabular-nums text-slate-500">
                                  {format(new Date(entry.at), 'MMM d, yyyy · h:mm a')}
                                  <span className="ml-2">
                                    {t('admin.cards.byActor', {
                                      actor: usersById.get(entry.byUserId) ?? entry.byUserId,
                                    })}
                                  </span>
                                </span>
                              </li>
                            ))}
                          </ul>
                        </td>
                      </tr>
                    ) : null}
                  </>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {replacingCard ? (
        <div
          role="dialog"
          aria-label={t('admin.cards.replaceTitle')}
          className="fixed inset-0 z-20 flex items-center justify-center bg-slate-900/40 p-4"
        >
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="text-lg font-semibold text-slate-900">
              {t('admin.cards.replaceTitle')}
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              {t('admin.cards.replaceBody', { uid: replacingCard.rfidUid })}
            </p>
            <label className="mt-4 block text-sm font-medium text-slate-700">
              {t('admin.cards.newUidLabel')}
              <input
                type="text"
                value={replaceUid}
                onChange={(e) => setReplaceUid(e.target.value.toUpperCase())}
                placeholder="AABBCCDD"
                className="mt-1 block h-11 w-full rounded-lg border border-slate-300 bg-white px-3 font-mono text-sm uppercase text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
              />
            </label>
            <div className="mt-5 flex justify-end gap-2">
              <Button
                variant="ghost"
                onClick={() => {
                  setReplacingCard(null)
                  setReplaceUid('')
                }}
              >
                {t('common.cancel')}
              </Button>
              <Button
                onClick={runReplace}
                isLoading={replace.isPending}
                disabled={!replaceUid || replace.isPending}
              >
                {t('admin.cards.confirmReplace')}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
