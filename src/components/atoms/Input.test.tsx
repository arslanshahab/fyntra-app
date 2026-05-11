import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { Input } from './Input'

describe('Input', () => {
  it('renders an input element by default', () => {
    render(<Input placeholder="Phone" />)
    const input = screen.getByPlaceholderText('Phone')
    expect(input).toBeInTheDocument()
    expect(input).toHaveAttribute('type', 'text')
  })

  it('forwards the type prop', () => {
    render(<Input type="tel" placeholder="Phone" />)
    expect(screen.getByPlaceholderText('Phone')).toHaveAttribute('type', 'tel')
  })

  it('sets aria-invalid when hasError is true', () => {
    render(<Input hasError placeholder="Phone" />)
    expect(screen.getByPlaceholderText('Phone')).toHaveAttribute('aria-invalid', 'true')
  })

  it('accepts user input', async () => {
    render(<Input placeholder="Phone" />)
    const input = screen.getByPlaceholderText('Phone')
    await userEvent.type(input, '0300')
    expect(input).toHaveValue('0300')
  })
})
