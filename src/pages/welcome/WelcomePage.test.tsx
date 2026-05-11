import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { I18nextProvider } from 'react-i18next'
import { MemoryRouter } from 'react-router-dom'

import i18n from '../../i18n'
import { WelcomePage } from './WelcomePage'

function renderPage() {
  return render(
    <I18nextProvider i18n={i18n}>
      <MemoryRouter>
        <WelcomePage />
      </MemoryRouter>
    </I18nextProvider>,
  )
}

describe('WelcomePage', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en')
  })

  afterEach(() => {
    document.documentElement.lang = ''
    document.documentElement.dir = ''
  })

  it('renders the English heading and tagline by default', () => {
    renderPage()
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Welcome to Fyntra')
    expect(screen.getByText(/peace of mind/i)).toBeInTheDocument()
  })

  it('switches to Urdu when the language toggle is clicked', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(screen.getByRole('button', { name: /اردو/ }))
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Fyntra میں خوش آمدید')
    expect(i18n.language).toBe('ur')
  })
})
