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
import { AdminCardsPage } from './AdminCardsPage'

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
        <MemoryRouter initialEntries={['/admin/cards']}>
          <Routes>
            <Route path="/admin/cards" element={<AdminCardsPage />} />
          </Routes>
        </MemoryRouter>
      </I18nextProvider>
    </QueryClientProvider>,
  )
}

describe('AdminCardsPage', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en')
    const admin = seedStore.users.find((u) => u.role === 'admin')!
    useAuthStore.setState({ token: `tok_${admin.id}`, user: admin })
  })

  it('renders the cards table with the seed counts', async () => {
    renderPage()
    expect(await screen.findByText(/60 cards/i)).toBeInTheDocument()
  })

  it('marks a card as lost and surfaces a success banner', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByText(/60 cards/i)
    const [firstMarkLost] = await screen.findAllByRole('button', { name: /mark lost/i })
    await user.click(firstMarkLost!)
    expect(await screen.findByText(/card marked as lost/i)).toBeInTheDocument()
  })

  it('shows the audit trail when a row is expanded', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByText(/60 cards/i)
    const [firstToggle] = await screen.findAllByRole('button', { name: /toggle history/i })
    await user.click(firstToggle!)
    await waitFor(() => {
      expect(screen.getByText(/audit trail/i)).toBeInTheDocument()
    })
    // Seed cards start with an "Issued" audit entry.
    expect(screen.getAllByText(/issued/i).length).toBeGreaterThan(0)
  })
})
