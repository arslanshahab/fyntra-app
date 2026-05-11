import { type HTMLAttributes } from 'react'

import { cn } from '../../utils/cn'

type AvatarSize = 'xs' | 'sm' | 'md' | 'lg'

interface AvatarProps extends Omit<HTMLAttributes<HTMLSpanElement>, 'aria-label' | 'role'> {
  src?: string
  name: string
  size?: AvatarSize
}

const sizeClasses: Record<AvatarSize, string> = {
  xs: 'h-6 w-6 text-[10px]',
  sm: 'h-8 w-8 text-xs',
  md: 'h-10 w-10 text-sm',
  lg: 'h-12 w-12 text-base',
}

function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase()
  return (parts[0]!.charAt(0) + parts[parts.length - 1]!.charAt(0)).toUpperCase()
}

export function Avatar({ src, name, size = 'md', className, ...props }: AvatarProps) {
  const initials = initialsFromName(name)

  return (
    <span
      role="img"
      aria-label={name}
      className={cn(
        'inline-flex select-none items-center justify-center overflow-hidden rounded-full bg-slate-200 font-medium uppercase text-slate-700',
        sizeClasses[size],
        className,
      )}
      {...props}
    >
      {src ? (
        <img src={src} alt="" className="h-full w-full object-cover" />
      ) : (
        <span aria-hidden="true">{initials}</span>
      )}
    </span>
  )
}
