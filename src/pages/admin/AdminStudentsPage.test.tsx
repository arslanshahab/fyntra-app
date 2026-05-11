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
import { AdminStudentsPage } from './AdminStudentsPage'

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
        <MemoryRouter initialEntries={['/admin/students']}>
          <Routes>
            <Route path="/admin/students" element={<AdminStudentsPage />} />
            <Route path="/admin/students/:id" element={<div>Detail page</div>} />
          </Routes>
        </MemoryRouter>
      </I18nextProvider>
    </QueryClientProvider>,
  )
}

describe('AdminStudentsPage', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en')
    const admin = seedStore.users.find((u) => u.role === 'admin')!
    useAuthStore.setState({ token: `tok_${admin.id}`, user: admin })
  })

  it('lists all 60 seed students on first load', async () => {
    renderPage()
    expect(await screen.findByText('60 students')).toBeInTheDocument()
  })

  it('filters by debounced search input', async () => {
    const user = userEvent.setup()
    renderPage()
    // Pick a stable substring from the first student's name.
    const firstName = seedStore.students[0]!.fullName.split(' ')[0]!
    await screen.findByText('60 students')
    await user.type(screen.getByRole('searchbox'), firstName)
    await waitFor(
      () => {
        // After debounce + refetch the count should drop below 60.
        const counter = screen.getByText(/student/i)
        expect(counter.textContent).not.toBe('60 students')
      },
      { timeout: 2000 },
    )
  })

  it('navigates to the detail page when a row is clicked', async () => {
    const user = userEvent.setup()
    renderPage()
    const target = seedStore.students[0]!
    const cell = await screen.findByText(target.fullName)
    await user.click(cell)
    expect(await screen.findByText('Detail page')).toBeInTheDocument()
  })
})
