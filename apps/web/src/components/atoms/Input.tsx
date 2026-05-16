import { type InputHTMLAttributes, type Ref } from 'react'

import { cn } from '../../utils/cn'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  ref?: Ref<HTMLInputElement>
  hasError?: boolean
}

export function Input({ ref, hasError = false, type = 'text', className, ...props }: InputProps) {
  return (
    <input
      ref={ref}
      type={type}
      aria-invalid={hasError || undefined}
      className={cn(
        // 44px height (h-11) matches the thumb-reach floor for the parent app.
        'block h-11 w-full rounded-lg border bg-white px-3 text-sm text-stone-900 placeholder:text-stone-400',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1',
        'disabled:cursor-not-allowed disabled:bg-stone-50 disabled:text-stone-400',
        hasError
          ? 'border-status-alarm focus-visible:ring-status-alarm'
          : 'border-stone-300 focus-visible:ring-brand-500',
        className,
      )}
      {...props}
    />
  )
}
