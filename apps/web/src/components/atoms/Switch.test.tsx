import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { Switch } from './Switch'

describe('Switch', () => {
  it('exposes role="switch" with aria-checked reflecting state', () => {
    render(<Switch checked={true} onChange={() => {}} ariaLabel="WhatsApp" />)
    const sw = screen.getByRole('switch', { name: 'WhatsApp' })
    expect(sw).toHaveAttribute('aria-checked', 'true')
  })

  it('fires onChange with the inverted value when clicked', async () => {
    const onChange = vi.fn()
    render(<Switch checked={false} onChange={onChange} ariaLabel="WhatsApp" />)
    await userEvent.click(screen.getByRole('switch'))
    expect(onChange).toHaveBeenCalledWith(true)
  })

  it('is keyboard-actionable via Space and Enter', async () => {
    const onChange = vi.fn()
    render(<Switch checked={false} onChange={onChange} ariaLabel="WhatsApp" />)
    const sw = screen.getByRole('switch')
    sw.focus()
    await userEvent.keyboard(' ')
    expect(onChange).toHaveBeenCalledTimes(1)
  })

  it('does not fire onChange when disabled', async () => {
    const onChange = vi.fn()
    render(<Switch checked={false} onChange={onChange} disabled ariaLabel="WhatsApp" />)
    await userEvent.click(screen.getByRole('switch'))
    expect(onChange).not.toHaveBeenCalled()
  })
})
