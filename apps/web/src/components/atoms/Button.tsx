import { type ButtonHTMLAttributes, type ReactNode, type Ref } from 'react'

import { cn } from '../../utils/cn'
import { Spinner } from './Spinner'

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'destructive'
type ButtonSize = 'sm' | 'md' | 'lg'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  ref?: Ref<HTMLButtonElement>
  variant?: ButtonVariant
  size?: ButtonSize
  isLoading?: boolean
  leftIcon?: ReactNode
  rightIcon?: ReactNode
}

const base =
  'inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-[background-color,box-shadow,color] duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 disabled:shadow-none'

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    'bg-brand-600 text-white shadow-elev-1 hover:bg-brand-700 hover:shadow-elev-2 focus-visible:ring-brand-500',
  secondary:
    'bg-stone-100 text-stone-900 ring-1 ring-inset ring-stone-200 hover:bg-stone-200 focus-visible:ring-stone-400',
  ghost: 'bg-transparent text-stone-700 hover:bg-stone-100 focus-visible:ring-stone-400',
  destructive:
    'bg-status-absent text-white shadow-elev-1 hover:bg-status-absent/90 hover:shadow-elev-2 focus-visible:ring-status-absent',
}

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'h-9 px-3 text-sm',
  md: 'h-11 px-4 text-sm', // 44px — thumb-reach minimum per README §10
  lg: 'h-12 px-6 text-base',
}

export function Button({
  ref,
  variant = 'primary',
  size = 'md',
  isLoading = false,
  leftIcon,
  rightIcon,
  type = 'button',
  disabled,
  className,
  children,
  ...props
}: ButtonProps) {
  const isDisabled = disabled || isLoading
  return (
    <button
      ref={ref}
      type={type}
      disabled={isDisabled}
      aria-busy={isLoading || undefined}
      aria-disabled={isDisabled || undefined}
      className={cn(base, variantClasses[variant], sizeClasses[size], className)}
      {...props}
    >
      {isLoading ? <Spinner size="sm" label="" /> : leftIcon}
      {children}
      {!isLoading && rightIcon}
    </button>
  )
}
