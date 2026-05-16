import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { I18nextProvider } from 'react-i18next'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { setupServer } from 'msw/node'
import { http, HttpResponse } from 'msw'

import i18n from '../../i18n'
import { handlers } from '../../services/mocks/handlers'
import { seedStore } from '../../services/mocks/seed'
import { useAuthStore } from '../../stores/auth'
import { AdminDeviceDetailPage } from './AdminDeviceDetailPage'

const server = setupServer(...handlers)

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => {
  server.resetHandlers()
  useAuthStore.setState({ token: null, user: null })
})
afterAll(() => server.close())

function renderPage(deviceId = 'dev_main') {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(
    <QueryClientProvider client={client}>
      <I18nextProvider i18n={i18n}>
        <MemoryRouter initialEntries={[`/admin/devices/${deviceId}`]}>
          <Routes>
            <Route path="/admin/devices/:id" element={<AdminDeviceDetailPage />} />
            <Route path="/admin/devices" element={<div>devices list</div>} />
          </Routes>
        </MemoryRouter>
      </I18nextProvider>
    </QueryClientProvider>,
  )
}

describe('AdminDeviceDetailPage', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en')
    const admin = seedStore.users.find((u) => u.role === 'admin')!
    useAuthStore.setState({ token: `tok_${admin.id}`, user: admin })
  })

  it('loads device data and renders the editable label', async () => {
    renderPage('dev_main')
    const labelInput = (await screen.findByLabelText(/^label$/i)) as HTMLInputElement
    await waitFor(() => {
      expect(labelInput.value).toBe('Main Gate')
    })
  })

  it('renders the tokens table with the seeded token', async () => {
    renderPage('dev_main')
    expect(await screen.findByText(/main gate dev token/i)).toBeInTheDocument()
  })

  it('issues a new token, shows the plaintext once, and refreshes the list on close', async () => {
    const user = userEvent.setup()
    // Mock-override the issue endpoint to return a known plaintext so the
    // assertion is exact instead of regex-matching random bytes.
    server.use(
      http.post('*/api/devices/:id/tokens', async ({ params, request }) => {
        const body = (await request.json()) as { label: string }
        const deviceToken = {
          id: 'dtk_new_1',
          deviceId: params.id as string,
          label: body.label,
          createdAt: new Date().toISOString(),
        }
        // Mirror the default handler's side-effect so that the subsequent
        // GET /devices/:id/tokens (which falls through to the default
        // handler) returns the newly-issued row.
        seedStore.deviceTokens.push(deviceToken)
        return HttpResponse.json({ token: 'tok_test_12345', deviceToken })
      }),
    )

    renderPage('dev_main')
    // Wait for initial token row to render.
    await screen.findByText(/main gate dev token/i)

    await user.click(screen.getByRole('button', { name: /issue new token/i }))
    const issueDialog = await screen.findByRole('dialog', { name: /issue device token/i })

    const labelInput = within(issueDialog).getByLabelText(/token label/i)
    await user.type(labelInput, 'Bridge 2')
    await user.click(within(issueDialog).getByRole('button', { name: /generate token/i }))

    // Plaintext-once success view appears with the exact value the handler returned.
    const successDialog = await screen.findByRole('dialog', { name: /issue device token/i })
    expect(await within(successDialog).findByTestId('plaintext-token')).toHaveTextContent(
      'tok_test_12345',
    )

    // Closing the modal closes the dialog AND triggers a refetch via query
    // invalidation. Because the override mirrors the seedStore push, the
    // default GET handler returns the new row.
    await user.click(within(successDialog).getByRole('button', { name: /^done$/i }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    await waitFor(() => {
      expect(screen.getByText('Bridge 2')).toBeInTheDocument()
    })
  })
})
