import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Check } from 'lucide-react'

import { Icon } from './Icon'

describe('Icon', () => {
  it('is hidden from assistive tech by default (decorative)', () => {
    render(<Icon icon={Check} data-testid="icon" />)
    // No accessible name and no role=img
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })

  it('exposes a label when provided (meaningful icon)', () => {
    render(<Icon icon={Check} label="Confirmed" />)
    expect(screen.getByRole('img', { name: 'Confirmed' })).toBeInTheDocument()
  })

  it('applies the requested size class', () => {
    const { container } = render(<Icon icon={Check} size="lg" />)
    const svg = container.querySelector('svg')
    expect(svg?.getAttribute('class')).toContain('h-6')
    expect(svg?.getAttribute('class')).toContain('w-6')
  })
})
