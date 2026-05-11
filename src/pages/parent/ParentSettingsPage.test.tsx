import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { I18nextProvider } from 'react-i18next'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { setupServer } from 'msw/node'

import i18n from '../../i18n'
import { handlers } from '../../services/mocks/handlers'
import { seedStore } from '../../services/mocks/seed'
import { useAuthStore } from '../../stores/auth'
import { ParentSettingsPage } from './ParentSettingsPage'

const server = setupServer(...handlers)

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => {
  server.resetHandlers()
  useAuthStore.setState({ token: null, user: null })
})
afterAll(() => server.close())

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(
    <QueryClientProvider client={client}>
      <I18nextProvider i18n={i18n}>
        <MemoryRouter initialEntries={['/parent/settings']}>
          <Routes>
            <Route path="/parent/settings" element={<ParentSettingsPage />} />
            <Route path="/parent" element={<div>Parent home</div>} />
          </Routes>
        </MemoryRouter>
      </I18nextProvider>
    </QueryClientProvider>,
  )
}

describe('ParentSettingsPage', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en')
    const parent = seedStore.users.find((u) => u.role === 'parent')!
    useAuthStore.setState({ token: `tok_${parent.id}`, user: parent })
  })

  it('renders the three channel toggles and five event toggles (no device_offline)', async () => {
    renderPage()
    expect(await screen.findByRole('switch', { name: /whatsapp/i })).toBeInTheDocument()
    expect(screen.getByRole('switch', { name: /sms/i })).toBeInTheDocument()
    expect(screen.getByRole('switch', { name: /in-app/i })).toBeInTheDocument()
    expect(screen.getByRole('switch', { name: /tap in/i })).toBeInTheDocument()
    expect(screen.getByRole('switch', { name: /tap out/i })).toBeInTheDocument()
    expect(screen.getByRole('switch', { name: /late arrival/i })).toBeInTheDocument()
    expect(screen.getByRole('switch', { name: /^absent$/i })).toBeInTheDocument()
    expect(screen.getByRole('switch', { name: /manual override/i })).toBeInTheDocument()
    // Per spec: parents must NOT see device_offline.
    expect(screen.queryByRole('switch', { name: /device offline/i })).not.toBeInTheDocument()
  })

  it('flips a channel switch optimistically when toggled', async () => {
    const user = userEvent.setup()
    renderPage()
    const sms = await screen.findByRole('switch', { name: /sms/i })
    expect(sms).toHaveAttribute('aria-checked', 'true') // seed default
    await user.click(sms)
    await waitFor(() => {
      expect(screen.getByRole('switch', { name: /sms/i })).toHaveAttribute('aria-checked', 'false')
    })
  })

  it('language toggle switches active locale', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByRole('switch', { name: /whatsapp/i })
    const urButton = screen.getByRole('button', { name: /اردو/ })
    await user.click(urButton)
    await waitFor(() => {
      expect(i18n.language).toBe('ur')
    })
    // Reset back to English so subsequent tests have a known starting state.
    await i18n.changeLanguage('en')
  })
})
