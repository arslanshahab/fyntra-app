import { type ReactNode } from 'react'

interface ModalProps {
  label: string
  children: ReactNode
}

export function Modal({ label, children }: ModalProps) {
  return (
    <div
      role="dialog"
      aria-label={label}
      className="fixed inset-0 z-20 flex items-center justify-center bg-stone-900/50 p-4 backdrop-blur-sm"
    >
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-elev-3 ring-1 ring-stone-200">
        {children}
      </div>
    </div>
  )
}
