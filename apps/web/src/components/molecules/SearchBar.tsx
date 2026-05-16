import { Search } from 'lucide-react'

import { Input } from '../atoms/Input'
import { cn } from '../../utils/cn'

interface SearchBarProps {
  value: string
  onChange: (next: string) => void
  placeholder?: string
  className?: string
  ariaLabel?: string
}

export function SearchBar({ value, onChange, placeholder, className, ariaLabel }: SearchBarProps) {
  return (
    <div className={cn('relative', className)}>
      <Search
        aria-hidden="true"
        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400 rtl:left-auto rtl:right-3"
      />
      <Input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={ariaLabel ?? placeholder}
        className="pl-9 rtl:pl-3 rtl:pr-9"
      />
    </div>
  )
}
