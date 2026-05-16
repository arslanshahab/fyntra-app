import { type HTMLAttributes, type ReactNode } from 'react'

import { cn } from '../../utils/cn'

type BadgeTone = 'present' | 'late' | 'notyet' | 'unverified' | 'absent' | 'neutral'
type BadgeSize = 'sm' | 'md'

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone
  size?: BadgeSize
  children: ReactNode
}

const toneClasses: Record<BadgeTone, string> = {
  present: 'bg-status-present/10 text-status-present ring-status-present/30',
  late: 'bg-status-late/10 text-status-late ring-status-late/30',
  notyet: 'bg-status-notyet/10 text-status-notyet ring-status-notyet/30',
  unverified: 'bg-status-unverified/10 text-status-unverified ring-status-unverified/30',
  absent: 'bg-status-absent/10 text-status-absent ring-status-absent/30',
  neutral: 'bg-stone-100 text-stone-700 ring-stone-200',
}

const sizeClasses: Record<BadgeSize, string> = {
  sm: 'px-2 py-0.5 text-xs',
  md: 'px-2.5 py-1 text-sm',
}

export function Badge({
  tone = 'neutral',
  size = 'sm',
  className,
  children,
  ...props
}: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full font-medium ring-1 ring-inset',
        toneClasses[tone],
        sizeClasses[size],
        className,
      )}
      {...props}
    >
      {children}
    </span>
  )
}
