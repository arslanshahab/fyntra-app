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
import { TeacherRegisterPage } from './TeacherRegisterPage'

const server = setupServer(...handlers)

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => {
  server.resetHandlers()
  useAuthStore.setState({ token: null, user: null })
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
        <MemoryRouter initialEntries={['/teacher/register']}>
          <Routes>
            <Route path="/teacher/register" element={<TeacherRegisterPage />} />
          </Routes>
        </MemoryRouter>
      </I18nextProvider>
    </QueryClientProvider>,
  )
}

describe('TeacherRegisterPage', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en')
    const teacher = seedStore.users.find((u) => u.role === 'teacher')!
    useAuthStore.setState({ token: `tok_${teacher.id}`, user: teacher })
  })

  it('renders the grid with the teacher class roster, day headers, and summary columns', async () => {
    renderPage()
    expect(await screen.findByRole('heading', { level: 1, name: 'Monthly register' })).toBeInTheDocument()
    // Student column header — wait for the async grid to land.
    expect(await screen.findByText('Student')).toBeInTheDocument()
    expect(screen.getByText('WD')).toBeInTheDocument()
    expect(screen.getByText('%')).toBeInTheDocument()
    expect(screen.getByText(/P present · L late/)).toBeInTheDocument()
  })

  it('month navigation arrows shift the displayed month', async () => {
    const user = userEvent.setup()
    renderPage()
    // Wait for the grid to render
    await screen.findByText('Student')
    const monthLabelInitial = (() => {
      const d = new Date()
      return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toLocaleString('en', {
        month: 'long',
        year: 'numeric',
        timeZone: 'UTC',
      })
    })()
    expect(screen.getByText(monthLabelInitial)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Previous month' }))
    await waitFor(() => {
      expect(screen.queryByText(monthLabelInitial)).not.toBeInTheDocument()
    })
  })

  it("a closed holiday in the month renders 'H' in the column header", async () => {
    const today = new Date()
    const month = `${today.getUTCFullYear()}-${String(today.getUTCMonth() + 1).padStart(2, '0')}`
    seedStore.holidays.push({
      id: 'hol_x',
      schoolId: seedStore.school.id,
      date: `${month}-15`,
      label: 'Test holiday',
      kind: 'closed',
      createdAt: new Date().toISOString(),
    })
    renderPage()
    await screen.findByText('Student')
    // 'H' appears both in the legend and as a column header for closed days.
    // Total count is at least 2 (one in legend + one in the column header).
    const hOccurrences = screen.getAllByText('H')
    expect(hOccurrences.length).toBeGreaterThanOrEqual(2)
  })
})
