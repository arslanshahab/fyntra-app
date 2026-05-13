import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

// twMerge resolves conflicting Tailwind utilities so a consumer's `className`
// can override base classes deterministically regardless of CSS order.
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}
