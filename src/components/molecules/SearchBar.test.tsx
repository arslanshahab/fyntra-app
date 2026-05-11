import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { SearchBar } from './SearchBar'

describe('SearchBar', () => {
  it('renders the current value', () => {
    render(<SearchBar value="ahmad" onChange={() => {}} placeholder="Search" />)
    expect(screen.getByRole('searchbox')).toHaveValue('ahmad')
  })

  it('calls onChange when the user types', async () => {
    const onChange = vi.fn()
    render(<SearchBar value="" onChange={onChange} placeholder="Search" />)
    await userEvent.type(screen.getByRole('searchbox'), 'a')
    expect(onChange).toHaveBeenCalledWith('a')
  })

  it('uses the placeholder as the accessible label when none is provided', () => {
    render(<SearchBar value="" onChange={() => {}} placeholder="Search students" />)
    expect(screen.getByRole('searchbox')).toHaveAccessibleName('Search students')
  })
})
