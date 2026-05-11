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
import { AdminDashboardPage } from './AdminDashboardPage'

const server = setupServer(...handlers)

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => {
  server.resetHandlers()
  useAuthStore.setState({ token: null, user: null })
})
afterAll(() => server.close())

function renderDashboard() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(
    <QueryClientProvider client={client}>
      <I18nextProvider i18n={i18n}>
        <MemoryRouter initialEntries={['/admin']}>
          <Routes>
            <Route path="/admin" element={<AdminDashboardPage />} />
            <Route path="/login" element={<div>Login</div>} />
          </Routes>
        </MemoryRouter>
      </I18nextProvider>
    </QueryClientProvider>,
  )
}

describe('AdminDashboardPage', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en')
  })

  it('renders the four headline stat labels once /me and today land', async () => {
    const admin = seedStore.users.find((u) => u.role === 'admin')!
    useAuthStore.setState({ token: `tok_${admin.id}`, user: admin })
    renderDashboard()
    expect(await screen.findByText('Present')).toBeInTheDocument()
    expect(screen.getByText('Late')).toBeInTheDocument()
    expect(screen.getByText('Absent')).toBeInTheDocument()
    expect(screen.getByText('No tap yet')).toBeInTheDocument()
  })

  it('shows the live tap feed section title', async () => {
    const admin = seedStore.users.find((u) => u.role === 'admin')!
    useAuthStore.setState({ token: `tok_${admin.id}`, user: admin })
    renderDashboard()
    expect(await screen.findByText('Live tap feed')).toBeInTheDocument()
  })

  it('shows the gate devices section with both seed devices', async () => {
    const admin = seedStore.users.find((u) => u.role === 'admin')!
    useAuthStore.setState({ token: `tok_${admin.id}`, user: admin })
    renderDashboard()
    expect(await screen.findByText('Gate devices')).toBeInTheDocument()
    expect(await screen.findByText('Main Gate')).toBeInTheDocument()
    expect(screen.getByText('Side Gate')).toBeInTheDocument()
  })

  it('greets with the admin user name in the header', async () => {
    const admin = seedStore.users.find((u) => u.role === 'admin')!
    useAuthStore.setState({ token: `tok_${admin.id}`, user: admin })
    renderDashboard()
    expect(await screen.findByText(admin.fullName)).toBeInTheDocument()
  })
})
