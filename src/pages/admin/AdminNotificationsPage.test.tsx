import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { setupServer } from 'msw/node'

import i18n from '../../i18n'
import { handlers } from '../../services/mocks/handlers'
import { seedStore } from '../../services/mocks/seed'
import { useAuthStore } from '../../stores/auth'
import { AdminNotificationsPage } from './AdminNotificationsPage'

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
        <MemoryRouter initialEntries={['/admin/notifications']}>
          <Routes>
            <Route path="/admin/notifications" element={<AdminNotificationsPage />} />
          </Routes>
        </MemoryRouter>
      </I18nextProvider>
    </QueryClientProvider>,
  )
}

describe('AdminNotificationsPage', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en')
    const admin = seedStore.users.find((u) => u.role === 'admin')!
    useAuthStore.setState({ token: `tok_${admin.id}`, user: admin })
  })

  it('renders the title and status filter pills', async () => {
    renderPage()
    expect(
      await screen.findByRole('heading', { level: 1, name: /notifications log/i }),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^all$/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /failed/i })).toBeInTheDocument()
  })

  it('shows notification rows for the admin (school-wide visibility)', async () => {
    renderPage()
    // Seed produces hundreds of arrived/left school notifications across
    // parents — assert that we see at least one.
    const rows = await screen.findAllByText(/(arrived at school|left school)/i)
    expect(rows.length).toBeGreaterThan(0)
  })
})
