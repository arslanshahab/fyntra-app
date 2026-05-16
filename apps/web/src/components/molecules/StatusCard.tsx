import { type LucideIcon } from 'lucide-react'
import { type ReactNode } from 'react'

import { Button } from '../atoms/Button'
import { cn } from '../../utils/cn'

type StatusCardTone = 'neutral' | 'alarm'
type StatusCardActionVariant = 'primary' | 'secondary'

interface StatusCardAction {
  label: string
  onClick: () => void
  variant?: StatusCardActionVariant
}

interface StatusCardProps {
  tone?: StatusCardTone
  icon: LucideIcon
  title?: string
  body: ReactNode
  action?: StatusCardAction
  className?: string
}

const iconToneClasses: Record<StatusCardTone, string> = {
  neutral: 'bg-stone-100 text-stone-400',
  alarm: 'bg-status-alarm/10 text-status-alarm',
}

export function StatusCard({
  tone = 'neutral',
  icon: IconComponent,
  title,
  body,
  action,
  className,
}: StatusCardProps) {
  return (
    <div
      role={tone === 'alarm' ? 'alert' : undefined}
      className={cn(
        'rounded-hero bg-white p-8 text-center shadow-elev-1 ring-1 ring-stone-200',
        className,
      )}
    >
      <div
        className={cn(
          'mx-auto flex h-14 w-14 items-center justify-center rounded-full',
          iconToneClasses[tone],
        )}
      >
        <IconComponent aria-hidden="true" className="h-6 w-6" />
      </div>
      {title ? (
        <p className="mt-4 text-base font-medium text-stone-900">{title}</p>
      ) : null}
      <p
        className={cn(
          title ? 'mt-1' : 'mt-4',
          'text-sm leading-relaxed text-stone-600',
        )}
      >
        {body}
      </p>
      {action ? (
        <Button
          variant={action.variant ?? 'secondary'}
          size="md"
          className="mt-5"
          onClick={action.onClick}
        >
          {action.label}
        </Button>
      ) : null}
    </div>
  )
}
