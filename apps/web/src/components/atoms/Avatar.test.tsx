import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'

import { Avatar } from './Avatar'

describe('Avatar', () => {
  it('exposes the name as the accessible label', () => {
    render(<Avatar name="Ahmad Khan" />)
    expect(screen.getByRole('img', { name: 'Ahmad Khan' })).toBeInTheDocument()
  })

  it('falls back to initials from a two-word name', () => {
    render(<Avatar name="Ahmad Khan" />)
    expect(screen.getByText('AK')).toBeInTheDocument()
  })

  it('uses the first two letters when the name is a single word', () => {
    render(<Avatar name="Ahmad" />)
    expect(screen.getByText('AH')).toBeInTheDocument()
  })

  it('renders the image when src is provided', () => {
    render(<Avatar name="Ahmad Khan" src="/avatars/1.png" />)
    const img = screen.getByRole('img', { name: 'Ahmad Khan' }).querySelector('img')
    expect(img).not.toBeNull()
    expect(img?.getAttribute('src')).toBe('/avatars/1.png')
  })

  it('handles empty / whitespace names with a placeholder glyph', () => {
    render(<Avatar name="   " />)
    expect(screen.getByText('?')).toBeInTheDocument()
  })
})
