import { type HTMLAttributes } from 'react'

import { cn } from '../../utils/cn'

type SpinnerSize = 'sm' | 'md' | 'lg'

interface SpinnerProps extends Omit<HTMLAttributes<HTMLSpanElement>, 'aria-label' | 'role'> {
  size?: SpinnerSize
  // Pass an empty string to make the spinner decorative (e.g. inside a Button
  // that already conveys aria-busy). Non-empty values are announced.
  label?: string
}

const sizeClasses: Record<SpinnerSize, string> = {
  sm: 'h-4 w-4 border-2',
  md: 'h-6 w-6 border-2',
  lg: 'h-8 w-8 border-[3px]',
}

export function Spinner({ size = 'md', label = 'Loading', className, ...props }: SpinnerProps) {
  const accessibility = label
    ? ({ role: 'status', 'aria-label': label } as const)
    : ({ 'aria-hidden': true } as const)

  return (
    <span
      {...accessibility}
      className={cn('inline-flex items-center justify-center text-current', className)}
      {...props}
    >
      <span
        aria-hidden="true"
        className={cn(
          'animate-spin rounded-full border-current border-r-transparent',
          sizeClasses[size],
        )}
      />
    </span>
  )
}
