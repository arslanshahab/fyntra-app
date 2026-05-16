import { ChevronRight, Clock, MapPin } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Avatar } from '../atoms/Avatar'
import { Icon } from '../atoms/Icon'
import { cn } from '../../utils/cn'
import { type LiveStatus, toneFor } from '../../utils/attendanceStatus'
import { formatTimeInKarachi, splitDuration } from '../../utils/datetime'
import type { Student } from '@fyntra/schemas'

interface ChildCardProps {
  student: Student
  status: LiveStatus
  onOpenTimeline: () => void
  // Optional label for the device used in the child's most recent tap. Only
  // rendered when the status kind has an associated tap (at_school / left /
  // left_early). Hidden otherwise.
  lastDeviceLabel?: string
}

// Tone → accent classes. The stripe + dot answer the README §10 "one question
// per screen" rule: tone reads at-a-glance before any text is parsed.
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

function durationLabel(
  status: LiveStatus,
  t: (key: string, opts?: Record<string, unknown>) => string,
): string | null {
  let ms: number
  if (status.kind === 'at_school') {
    ms = Date.now() - new Date(status.firstInAt).getTime()
  } else if (status.kind === 'left' || status.kind === 'left_early') {
    ms = new Date(status.lastOutAt).getTime() - new Date(status.firstInAt).getTime()
  } else {
    return null
  }
  const { hours, minutes } = splitDuration(ms)
  if (hours === 0 && minutes === 0) return t('parent.metadata.justArrived')
  if (hours === 0) return t('parent.metadata.durationMinutesOnly', { minutes })
  return t('parent.metadata.durationHoursMinutes', { hours, minutes })
}

export function ChildCard({
  student,
  status,
  onOpenTimeline,
  lastDeviceLabel,
}: ChildCardProps) {
  const { t } = useTranslation()
  const tone = toneFor(status)
  const accent = toneAccent[tone]
  const { title, subtitle } = copyFor(status, student.fullName, t)
  const duration = durationLabel(status, t)
  const showMetadata = duration !== null || !!lastDeviceLabel

  return (
    <article
      data-testid={`child-card-${student.id}`}
      className="relative overflow-hidden rounded-hero bg-white shadow-elev-2 ring-1 ring-stone-200"
    >
      <div className={cn('h-1.5 w-full', accent.stripe)} aria-hidden="true" />
      <div className="p-6">
        <div className="flex items-center gap-3">
          <Avatar name={student.fullName} src={student.photoUrl} size="md" />
          <div className="min-w-0 flex-1">
            <p className="text-micro font-medium uppercase text-stone-500">
              {student.rollNumber}
            </p>
            <p className="truncate text-base font-semibold text-stone-900">{student.fullName}</p>
          </div>
        </div>

        <div className="mt-6 flex items-start gap-3">
          <span
            aria-hidden="true"
            className={cn('mt-3 h-3 w-3 flex-shrink-0 rounded-full', accent.dot)}
          />
          <div className="min-w-0 flex-1">
            <h2
              className={cn(
                'font-display text-display font-semibold tracking-tight',
                accent.text,
              )}
            >
              {title}
            </h2>
            <p className="mt-1.5 text-sm leading-relaxed text-stone-600">{subtitle}</p>
          </div>
        </div>

        {showMetadata ? (
          <div className="mt-5 space-y-1.5 border-t border-stone-100 pt-4">
            {duration ? (
              <p className="flex items-center gap-2 text-xs text-stone-600">
                <Icon icon={Clock} size="sm" className="flex-shrink-0 text-stone-400" />
                <span className="tabular-nums">{duration}</span>
              </p>
            ) : null}
            {lastDeviceLabel ? (
              <p className="flex items-center gap-2 text-xs text-stone-600">
                <Icon icon={MapPin} size="sm" className="flex-shrink-0 text-stone-400" />
                <span className="sr-only">{t('parent.metadata.lastSeenAtLabel')}</span>
                <span className="truncate">{lastDeviceLabel}</span>
              </p>
            ) : null}
          </div>
        ) : null}

        <button
          type="button"
          onClick={onOpenTimeline}
          className="mt-6 inline-flex w-full items-center justify-between rounded-xl bg-stone-50 px-4 py-3 text-sm font-medium text-stone-700 ring-1 ring-inset ring-stone-200 transition-colors hover:bg-stone-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
        >
          <span>{t('parent.viewTimeline')}</span>
          <Icon icon={ChevronRight} size="sm" className="rtl:rotate-180" />
        </button>
      </div>
    </article>
  )
}
