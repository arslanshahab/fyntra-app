import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'

import { Spinner } from './Spinner'

describe('Spinner', () => {
  it('announces a default loading label', () => {
    render(<Spinner />)
    expect(screen.getByRole('status')).toHaveAccessibleName('Loading')
  })

  it('uses a custom label when provided', () => {
    render(<Spinner label="لوڈ ہو رہا ہے" />)
    expect(screen.getByRole('status')).toHaveAccessibleName('لوڈ ہو رہا ہے')
  })

  it('hides from assistive tech when label is empty (decorative)', () => {
    render(<Spinner label="" data-testid="spinner" />)
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(screen.getByTestId('spinner')).toHaveAttribute('aria-hidden', 'true')
  })
})
