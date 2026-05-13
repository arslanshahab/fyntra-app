import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'

import { Badge } from './Badge'

describe('Badge', () => {
  it('renders its children', () => {
    render(<Badge>Present</Badge>)
    expect(screen.getByText('Present')).toBeInTheDocument()
  })

  it('applies tone-specific classes', () => {
    render(<Badge tone="present">Present</Badge>)
    const badge = screen.getByText('Present')
    expect(badge.className).toContain('text-status-present')
  })

  it('renders the absent tone with the alarm color', () => {
    render(<Badge tone="absent">Absent</Badge>)
    expect(screen.getByText('Absent').className).toContain('text-status-absent')
  })

  it('forwards arbitrary props to the span', () => {
    render(
      <Badge data-testid="badge" tone="late">
        Late
      </Badge>,
    )
    expect(screen.getByTestId('badge')).toBeInTheDocument()
  })
})
