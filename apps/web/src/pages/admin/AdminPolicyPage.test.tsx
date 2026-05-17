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
import { AdminPolicyPage } from './AdminPolicyPage'

const server = setupServer(...handlers)

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => {
  server.resetHandlers()
  useAuthStore.setState({ token: null, user: null })
  // Reset the seed's school policy so tests don't bleed.
  seedStore.school.workingDays = ['mon', 'tue', 'wed', 'thu', 'fri']
  seedStore.school.halfDayCutoffTime = undefined
  seedStore.school.academicYearStart = undefined
  seedStore.school.academicYearEnd = undefined
  seedStore.school.lateThresholdMinutes = 15
  seedStore.school.absentThresholdMinutes = 30
})
afterAll(() => server.close())

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(
    <QueryClientProvider client={client}>
      <I18nextProvider i18n={i18n}>
        <MemoryRouter initialEntries={['/admin/policy']}>
          <Routes>
            <Route path="/admin/policy" element={<AdminPolicyPage />} />
          </Routes>
        </MemoryRouter>
      </I18nextProvider>
    </QueryClientProvider>,
  )
}

describe('AdminPolicyPage', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en')
    const admin = seedStore.users.find((u) => u.role === 'admin')!
    useAuthStore.setState({ token: `tok_${admin.id}`, user: admin })
  })

  it('renders the policy form seeded with the current school values', async () => {
    renderPage()
    expect(await screen.findByLabelText(/^School start/)).toHaveValue('07:45')
    expect(screen.getByLabelText(/^School end/)).toHaveValue('13:30')
    expect(screen.getByLabelText(/^Late threshold/)).toHaveValue(15)
    expect(screen.getByLabelText(/^Absent threshold/)).toHaveValue(30)
  })

  it('Save button is disabled until a field changes', async () => {
    const user = userEvent.setup()
    renderPage()
    const save = await screen.findByRole('button', { name: 'Save policy' })
    expect(save).toBeDisabled()
    const late = screen.getByLabelText(/^Late threshold/)
    await user.clear(late)
    await user.type(late, '20')
    expect(save).toBeEnabled()
  })

  it('saves and shows success banner; seedStore reflects new values', async () => {
    const user = userEvent.setup()
    renderPage()
    const late = await screen.findByLabelText(/^Late threshold/)
    await user.clear(late)
    await user.type(late, '20')
    await user.click(screen.getByRole('button', { name: 'Save policy' }))
    await waitFor(() => {
      expect(screen.getByText(/policy updated/i)).toBeInTheDocument()
    })
    expect(seedStore.school.lateThresholdMinutes).toBe(20)
  })

  it('toggling Saturday on/off changes the working days set', async () => {
    const user = userEvent.setup()
    renderPage()
    // Each weekday is rendered inside a <label> with the day text.
    const sat = (await screen.findAllByText('Sat'))[0]!
    await user.click(sat)
    await user.click(screen.getByRole('button', { name: 'Save policy' }))
    await waitFor(() => {
      expect(seedStore.school.workingDays).toContain('sat')
    })
  })

  it('half-day cutoff: setting then clearing maps to undefined on the seed', async () => {
    const user = userEvent.setup()
    renderPage()
    const cutoff = await screen.findByLabelText(/^Half-day cutoff/)
    await user.clear(cutoff)
    await user.type(cutoff, '12:00')
    await user.click(screen.getByRole('button', { name: 'Save policy' }))
    await waitFor(() => {
      expect(seedStore.school.halfDayCutoffTime).toBe('12:00')
    })
    // Now clear it.
    await user.clear(cutoff)
    await user.click(screen.getByRole('button', { name: 'Save policy' }))
    await waitFor(() => {
      expect(seedStore.school.halfDayCutoffTime).toBeUndefined()
    })
  })

  it('client-side validation rejects empty working days', async () => {
    const user = userEvent.setup()
    renderPage()
    // Click all currently-active weekdays to clear them. findAllByText
    // handles potential collisions with abbreviations elsewhere on the page.
    await screen.findByText('Mon')
    for (const day of ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']) {
      const el = screen.getAllByText(day).find((n) => n.closest('label')) as HTMLElement
      await user.click(el)
    }
    await user.click(screen.getByRole('button', { name: 'Save policy' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/at least one working day/i)
  })
})
