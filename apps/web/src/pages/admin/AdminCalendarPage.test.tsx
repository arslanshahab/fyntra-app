import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { I18nextProvider } from 'react-i18next'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { setupServer } from 'msw/node'

import i18n from '../../i18n'
import { handlers } from '../../services/mocks/handlers'
import { seedStore } from '../../services/mocks/seed'
import { useAuthStore } from '../../stores/auth'
import { AdminCalendarPage } from './AdminCalendarPage'

const server = setupServer(...handlers)

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => {
  server.resetHandlers()
  useAuthStore.setState({ token: null, user: null })
  // Tests share the module-scoped seedStore; clear holidays so they don't bleed.
  seedStore.holidays.length = 0
})
afterAll(() => server.close())

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(
    <QueryClientProvider client={client}>
      <I18nextProvider i18n={i18n}>
        <MemoryRouter initialEntries={['/admin/calendar']}>
          <Routes>
            <Route path="/admin/calendar" element={<AdminCalendarPage />} />
          </Routes>
        </MemoryRouter>
      </I18nextProvider>
    </QueryClientProvider>,
  )
}

describe('AdminCalendarPage', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en')
    const admin = seedStore.users.find((u) => u.role === 'admin')!
    useAuthStore.setState({ token: `tok_${admin.id}`, user: admin })
  })

  it('renders the empty state when no holidays exist for the current year', async () => {
    renderPage()
    expect(
      await screen.findByText(new RegExp(`No holidays recorded for ${new Date().getFullYear()}`)),
    ).toBeInTheDocument()
  })

  it('opens the create modal and adds a closed holiday end-to-end', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(await screen.findByRole('button', { name: 'Add holiday' }))
    const dialog = await screen.findByRole('dialog', { name: 'Add a holiday' })

    // Date field
    const dateInput = within(dialog).getByLabelText('Date') as HTMLInputElement
    await user.clear(dateInput)
    await user.type(dateInput, `${new Date().getFullYear()}-08-14`)

    // Label
    await user.type(within(dialog).getByLabelText('Name'), 'Independence Day')

    // 'Closed' is the default kind, so just submit.
    await user.click(within(dialog).getByRole('button', { name: 'Add' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(await screen.findByText('Independence Day')).toBeInTheDocument()
    expect(screen.getByText('Closed')).toBeInTheDocument()
  })

  it('requires effectiveEndTime when kind is half_day', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(await screen.findByRole('button', { name: 'Add holiday' }))
    const dialog = await screen.findByRole('dialog', { name: 'Add a holiday' })

    const dateInput = within(dialog).getByLabelText('Date') as HTMLInputElement
    await user.clear(dateInput)
    await user.type(dateInput, `${new Date().getFullYear()}-04-03`)
    await user.type(within(dialog).getByLabelText('Name'), 'Half-day Friday')
    // Switch to half_day kind via the radio.
    await user.click(within(dialog).getByText('Half day'))

    // Submit without end time → client-side validation surfaces the error.
    await user.click(within(dialog).getByRole('button', { name: 'Add' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/Half days need an effective end time/)
    // Modal stays open.
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('deletes a holiday after confirm', async () => {
    const user = userEvent.setup()
    const year = new Date().getFullYear()
    seedStore.holidays.push({
      id: 'hol_test',
      schoolId: seedStore.school.id,
      date: `${year}-03-23`,
      label: 'Pakistan Day',
      kind: 'closed',
      createdAt: new Date().toISOString(),
    })
    renderPage()
    expect(await screen.findByText('Pakistan Day')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Delete' }))
    const confirm = await screen.findByRole('dialog', { name: 'Delete this holiday?' })
    await user.click(within(confirm).getByRole('button', { name: 'Delete' }))

    await waitFor(() => expect(screen.queryByText('Pakistan Day')).not.toBeInTheDocument())
  })

  it('filters by year (prev/next year buttons re-query)', async () => {
    const user = userEvent.setup()
    const thisYear = new Date().getFullYear()
    seedStore.holidays.push({
      id: 'hol_this',
      schoolId: seedStore.school.id,
      date: `${thisYear}-03-23`,
      label: 'Pakistan Day',
      kind: 'closed',
      createdAt: new Date().toISOString(),
    })
    seedStore.holidays.push({
      id: 'hol_next',
      schoolId: seedStore.school.id,
      date: `${thisYear + 1}-03-23`,
      label: 'Pakistan Day Next Year',
      kind: 'closed',
      createdAt: new Date().toISOString(),
    })
    renderPage()
    expect(await screen.findByText('Pakistan Day')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Next year' }))
    expect(await screen.findByText('Pakistan Day Next Year')).toBeInTheDocument()
    expect(screen.queryByText('Pakistan Day')).not.toBeInTheDocument()
  })
})
