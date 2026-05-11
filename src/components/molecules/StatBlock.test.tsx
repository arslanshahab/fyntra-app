import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'

import { StatBlock } from './StatBlock'

describe('StatBlock', () => {
  it('renders the label and value', () => {
    render(<StatBlock label="Present" value={42} />)
    expect(screen.getByText('Present')).toBeInTheDocument()
    expect(screen.getByText('42')).toBeInTheDocument()
  })

  it('applies the tone class on the value', () => {
    render(<StatBlock label="Absent" value={3} tone="absent" />)
    expect(screen.getByText('3').className).toContain('text-status-absent')
  })

  it('renders an optional hint below the value', () => {
    render(<StatBlock label="Present" value={42} hint="of 60 students" />)
    expect(screen.getByText('of 60 students')).toBeInTheDocument()
  })
})
