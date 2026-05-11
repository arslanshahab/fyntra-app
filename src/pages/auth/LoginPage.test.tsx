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
import { LoginPage } from './LoginPage'

const server = setupServer(...handlers)

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => {
  server.resetHandlers()
  useAuthStore.setState({ token: null, user: null })
})
afterAll(() => server.close())

function renderLogin() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(
    <QueryClientProvider client={client}>
      <I18nextProvider i18n={i18n}>
        <MemoryRouter initialEntries={['/login']}>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/" element={<div>Landed on /</div>} />
          </Routes>
        </MemoryRouter>
      </I18nextProvider>
    </QueryClientProvider>,
  )
}

describe('LoginPage', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en')
  })

  it('rejects an invalid phone number before requesting an OTP', async () => {
    const user = userEvent.setup()
    renderLogin()
    await user.type(screen.getByLabelText(/phone number/i), '0300')
    await user.click(screen.getByRole('button', { name: /send code/i }))
    expect(await screen.findByText(/valid pakistani mobile number/i)).toBeInTheDocument()
  })

  it('advances to the OTP step after a successful request', async () => {
    const user = userEvent.setup()
    const parent = seedStore.users.find((u) => u.role === 'parent')!
    renderLogin()
    await user.type(screen.getByLabelText(/phone number/i), parent.phone)
    await user.click(screen.getByRole('button', { name: /send code/i }))
    expect(await screen.findByLabelText(/one-time code/i)).toBeInTheDocument()
  })

  it('signs the user in and navigates away on successful verify', async () => {
    const user = userEvent.setup()
    const parent = seedStore.users.find((u) => u.role === 'parent')!
    renderLogin()

    await user.type(screen.getByLabelText(/phone number/i), parent.phone)
    await user.click(screen.getByRole('button', { name: /send code/i }))

    const otpField = await screen.findByLabelText(/one-time code/i)
    await user.type(otpField, '1234')
    await user.click(screen.getByRole('button', { name: /^verify$/i }))

    await waitFor(() => {
      expect(useAuthStore.getState().token).toMatch(/^tok_/)
      expect(useAuthStore.getState().user?.id).toBe(parent.id)
    })
    expect(await screen.findByText('Landed on /')).toBeInTheDocument()
  })

  it('surfaces a friendly error when verify rejects (unknown phone path)', async () => {
    const user = userEvent.setup()
    // The handler validates phone existence on /verify-otp. /request-otp
    // always returns ok, so we get to the OTP step with an unknown phone,
    // then verify fails with 401.
    renderLogin()
    await user.type(screen.getByLabelText(/phone number/i), '+929999999999')
    await user.click(screen.getByRole('button', { name: /send code/i }))

    const otpField = await screen.findByLabelText(/one-time code/i)
    await user.type(otpField, '1234')
    await user.click(screen.getByRole('button', { name: /^verify$/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/not registered/i)
    expect(useAuthStore.getState().token).toBeNull()
  })
})
