import { type LucideIcon } from 'lucide-react'

import { cn } from '../../utils/cn'

type IconSize = 'sm' | 'md' | 'lg'

interface IconProps {
  icon: LucideIcon
  size?: IconSize
  className?: string
  // Provide a label when the icon carries meaning on its own (icon-only
  // buttons should set this). Omit for decorative use beside text.
  label?: string
}

const sizeClasses: Record<IconSize, string> = {
  sm: 'h-4 w-4',
  md: 'h-5 w-5',
  lg: 'h-6 w-6',
}

export function Icon({ icon: IconComponent, size = 'md', className, label }: IconProps) {
  if (label) {
    return (
      <IconComponent role="img" aria-label={label} className={cn(sizeClasses[size], className)} />
    )
  }
  return <IconComponent aria-hidden="true" className={cn(sizeClasses[size], className)} />
}
