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
import { AdminDevicesPage } from './AdminDevicesPage'

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
        <MemoryRouter initialEntries={['/admin/devices']}>
          <Routes>
            <Route path="/admin/devices" element={<AdminDevicesPage />} />
          </Routes>
        </MemoryRouter>
      </I18nextProvider>
    </QueryClientProvider>,
  )
}

describe('AdminDevicesPage', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en')
    const admin = seedStore.users.find((u) => u.role === 'admin')!
    useAuthStore.setState({ token: `tok_${admin.id}`, user: admin })
  })

  it('renders both seed gate devices as cards', async () => {
    renderPage()
    expect(await screen.findByRole('heading', { level: 2, name: 'Main Gate' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: 'Side Gate' })).toBeInTheDocument()
  })

  it('shows the simulate tap panel with the bridge status indicator', async () => {
    renderPage()
    expect(await screen.findByText('Simulate tap')).toBeInTheDocument()
    // No bridge service running in tests → disconnected status surfaces.
    expect(screen.getByText(/bridge disconnected/i)).toBeInTheDocument()
  })

  it('submits a simulated tap with a known seed UID', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByRole('heading', { level: 2, name: 'Main Gate' })
    const knownUid = seedStore.cards[0]!.rfidUid
    const uidInput = screen.getByLabelText(/rfid uid/i) as HTMLInputElement
    await user.type(uidInput, knownUid)
    await user.click(screen.getByRole('button', { name: /submit tap/i }))
    await waitFor(() => {
      expect(screen.getByText(/tap submitted/i)).toBeInTheDocument()
    })
  })
})
