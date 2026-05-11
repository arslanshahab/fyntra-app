import { ChevronRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Avatar } from '../atoms/Avatar'
import { Icon } from '../atoms/Icon'
import { cn } from '../../utils/cn'
import { type LiveStatus, toneFor } from '../../utils/attendanceStatus'
import { formatTimeInKarachi } from '../../utils/datetime'
import type { Student } from '../../types/schemas'

interface ChildCardProps {
  student: Student
  status: LiveStatus
  onOpenTimeline: () => void
}

// Tone → accent classes for the top stripe and the leading dot. The hero
// answers the README §10 "one question per screen" rule, so the colour
// reads at-a-glance from across the room.
const toneAccent: Record<
  ReturnType<typeof toneFor>,
  { stripe: string; dot: string; text: string }
> = {
  present: { stripe: 'bg-status-present', dot: 'bg-status-present', text: 'text-status-present' },
  late: { stripe: 'bg-status-late', dot: 'bg-status-late', text: 'text-status-late' },
  notyet: { stripe: 'bg-status-notyet', dot: 'bg-status-notyet', text: 'text-status-notyet' },
  unverified: {
    stripe: 'bg-status-unverified',
    dot: 'bg-status-unverified',
    text: 'text-status-unverified',
  },
  absent: { stripe: 'bg-status-absent', dot: 'bg-status-absent', text: 'text-status-absent' },
}

function copyFor(
  status: LiveStatus,
  studentName: string,
  t: (key: string, opts?: Record<string, unknown>) => string,
): { title: string; subtitle: string } {
  switch (status.kind) {
    case 'at_school':
      return status.isLate
        ? {
            title: t('parent.status.atSchoolLate.title', { name: studentName }),
            subtitle: t('parent.status.atSchoolLate.subtitle', {
              time: formatTimeInKarachi(status.firstInAt),
            }),
          }
        : {
            title: t('parent.status.atSchool.title', { name: studentName }),
            subtitle: t('parent.status.atSchool.subtitle', {
              time: formatTimeInKarachi(status.firstInAt),
            }),
          }
    case 'left':
      return {
        title: t('parent.status.left.title', { name: studentName }),
        subtitle: t('parent.status.left.subtitle', {
          time: formatTimeInKarachi(status.lastOutAt),
        }),
      }
    case 'left_early':
      return {
        title: t('parent.status.leftEarly.title', { name: studentName }),
        subtitle: t('parent.status.leftEarly.subtitle', {
          time: formatTimeInKarachi(status.lastOutAt),
        }),
      }
    case 'pre_school':
      return {
        title: t('parent.status.preSchool.title', { minutes: status.minutesUntilStart }),
        subtitle: t('parent.status.preSchool.subtitle', { name: studentName }),
      }
    case 'not_yet':
      return {
        title: t('parent.status.notYet.title', { name: studentName }),
        subtitle: t('parent.status.notYet.subtitle', { minutes: status.minutesAfterStart }),
      }
    case 'absent':
      return {
        title: t('parent.status.absent.title', { name: studentName }),
        subtitle: t('parent.status.absent.subtitle', { minutes: status.minutesAfterStart }),
      }
    case 'no_card':
      return {
        title: t('parent.status.noCard.title', { name: studentName }),
        subtitle: t('parent.status.noCard.subtitle'),
      }
    case 'unverified':
      return {
        title: t('parent.status.unverified.title', { name: studentName }),
        subtitle: t('parent.status.unverified.subtitle'),
      }
  }
}

export function ChildCard({ student, status, onOpenTimeline }: ChildCardProps) {
  const { t } = useTranslation()
  const tone = toneFor(status)
  const accent = toneAccent[tone]
  const { title, subtitle } = copyFor(status, student.fullName, t)

  return (
    <article
      data-testid={`child-card-${student.id}`}
      className="relative overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200"
    >
      <div className={cn('h-1.5 w-full', accent.stripe)} aria-hidden="true" />
      <div className="p-5">
        <div className="flex items-center gap-3">
          <Avatar name={student.fullName} src={student.photoUrl} size="md" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-slate-500">{student.rollNumber}</p>
            <p className="truncate text-base font-semibold text-slate-900">{student.fullName}</p>
          </div>
        </div>

        <div className="mt-5 flex items-start gap-3">
          <span
            aria-hidden="true"
            className={cn('mt-2 h-2.5 w-2.5 flex-shrink-0 rounded-full', accent.dot)}
          />
          <div>
            <h2 className={cn('text-lg font-semibold leading-snug', accent.text)}>{title}</h2>
            <p className="mt-1 text-sm leading-relaxed text-slate-600">{subtitle}</p>
          </div>
        </div>

        <button
          type="button"
          onClick={onOpenTimeline}
          className="mt-5 inline-flex w-full items-center justify-between rounded-lg bg-slate-50 px-4 py-3 text-sm font-medium text-slate-700 ring-1 ring-inset ring-slate-200 hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
        >
          <span>{t('parent.viewTimeline')}</span>
          <Icon icon={ChevronRight} size="sm" className="rtl:rotate-180" />
        </button>
      </div>
    </article>
  )
}
