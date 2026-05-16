import { useState } from 'react'
import { ChevronDown, ChevronRight, CreditCard } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { format } from 'date-fns'

import { Badge } from '../../components/atoms/Badge'
import { Button } from '../../components/atoms/Button'
import { Icon } from '../../components/atoms/Icon'
import { Modal } from '../../components/molecules/Modal'
import { StatusCard } from '../../components/molecules/StatusCard'
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

function CardRowSkeleton() {
  return (
    <tr aria-hidden="true" className="animate-pulse">
      <td className="px-2 py-3">
        <div className="h-4 w-4 rounded bg-stone-100" />
      </td>
      <td className="px-4 py-3">
        <div className="h-3.5 w-28 rounded bg-stone-100" />
      </td>
      <td className="hidden px-4 py-3 md:table-cell">
        <div className="h-3.5 w-36 rounded bg-stone-100" />
      </td>
      <td className="px-4 py-3">
        <div className="h-5 w-16 rounded-full bg-stone-100" />
      </td>
      <td className="px-4 py-3">
        <div className="ml-auto h-7 w-32 rounded-md bg-stone-100" />
      </td>
    </tr>
  )
}

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
    <div className="space-y-5">
      <header className="flex items-baseline justify-between gap-2">
        <h1 className="font-display text-2xl font-semibold tracking-tight text-stone-900">
          {t('admin.cards.title')}
        </h1>
        {cards.data ? (
          <span className="font-mono text-sm tabular-nums text-stone-500">
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
                ? 'rounded-full bg-brand-50 px-3 py-1.5 text-sm font-medium text-brand-700 ring-1 ring-inset ring-brand-100 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500'
                : 'rounded-full bg-white px-3 py-1.5 text-sm font-medium text-stone-600 ring-1 ring-inset ring-stone-200 transition-colors hover:bg-stone-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500'
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

      {!cards.isLoading && (!cards.data || cards.data.length === 0) ? (
        <StatusCard icon={CreditCard} body={t('admin.cards.empty')} />
      ) : (
        <div className="overflow-hidden rounded-2xl bg-white shadow-elev-1 ring-1 ring-stone-200">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-stone-200 text-sm">
              <thead className="bg-stone-50 text-micro uppercase text-stone-500">
                <tr>
                  <th scope="col" className="w-8 px-2 py-3" />
                  <th scope="col" className="px-4 py-3 text-left font-semibold">
                    {t('admin.cards.table.uid')}
                  </th>
                  <th
                    scope="col"
                    className="hidden px-4 py-3 text-left font-semibold md:table-cell"
                  >
                    {t('admin.cards.table.student')}
                  </th>
                  <th scope="col" className="px-4 py-3 text-left font-semibold">
                    {t('admin.cards.table.status')}
                  </th>
                  <th scope="col" className="px-4 py-3 text-right font-semibold">
                    {t('admin.cards.table.actions')}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {cards.isLoading
                  ? Array.from({ length: 6 }).map((_, i) => <CardRowSkeleton key={i} />)
                  : (cards.data ?? []).map((card) => {
                      const student = card.studentId ? studentsById.get(card.studentId) : undefined
                      const isExpanded = expandedId === card.id
                      return (
                        <>
                          <tr key={card.id} className="transition-colors hover:bg-stone-50">
                            <td className="px-2 py-3">
                              <button
                                type="button"
                                onClick={() => setExpandedId(isExpanded ? null : card.id)}
                                aria-expanded={isExpanded}
                                aria-label={t('admin.cards.toggleHistory')}
                                className="rounded p-1 text-stone-400 transition-colors hover:bg-stone-100 hover:text-stone-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                              >
                                <Icon icon={isExpanded ? ChevronDown : ChevronRight} size="sm" />
                              </button>
                            </td>
                            <td className="px-4 py-3 font-mono text-xs text-stone-700">
                              {card.rfidUid}
                            </td>
                            <td className="hidden px-4 py-3 text-stone-700 md:table-cell">
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
                                        runStatusChange(
                                          card.id,
                                          'lost',
                                          t('admin.cards.lostSuccess'),
                                        )
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
                              <td colSpan={5} className="bg-stone-50 px-4 py-3">
                                <p className="mb-2 text-micro font-medium uppercase text-stone-500">
                                  {t('admin.cards.auditTitle')}
                                </p>
                                <ul className="space-y-1.5 text-xs text-stone-600">
                                  {[...card.auditLog].reverse().map((entry, idx) => (
                                    <li
                                      key={`${card.id}-${idx}`}
                                      className="flex items-baseline justify-between gap-3"
                                    >
                                      <div className="min-w-0">
                                        <span className="font-medium text-stone-800">
                                          {t(`admin.cards.audit.${entry.action}`)}
                                        </span>
                                        {entry.note ? (
                                          <span className="ml-2 text-stone-500">{entry.note}</span>
                                        ) : null}
                                      </div>
                                      <span className="flex-shrink-0 font-mono tabular-nums text-stone-500">
                                        {format(new Date(entry.at), 'MMM d, yyyy · h:mm a')}
                                        <span className="ml-2">
                                          {t('admin.cards.byActor', {
                                            actor:
                                              usersById.get(entry.byUserId) ?? entry.byUserId,
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
          </div>
        </div>
      )}

      {replacingCard ? (
        <Modal label={t('admin.cards.replaceTitle')}>
          <h2 className="font-display text-lg font-semibold tracking-tight text-stone-900">
            {t('admin.cards.replaceTitle')}
          </h2>
          <p className="mt-1 text-sm text-stone-600">
            {t('admin.cards.replaceBody', { uid: replacingCard.rfidUid })}
          </p>
          <label className="mt-5 block text-sm font-medium text-stone-700">
            {t('admin.cards.newUidLabel')}
            <input
              type="text"
              value={replaceUid}
              onChange={(e) => setReplaceUid(e.target.value.toUpperCase())}
              placeholder="AABBCCDD"
              className="mt-1.5 block h-11 w-full rounded-lg border border-stone-300 bg-white px-3 font-mono text-sm uppercase tracking-wider text-stone-900 placeholder:text-stone-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
            />
          </label>
          <div className="mt-6 flex justify-end gap-2">
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
        </Modal>
      ) : null}
    </div>
  )
}
