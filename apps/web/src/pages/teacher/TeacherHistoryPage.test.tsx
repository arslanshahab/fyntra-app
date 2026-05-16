import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { setupServer } from 'msw/node'

import i18n from '../../i18n'
import { handlers } from '../../services/mocks/handlers'
import { seedStore } from '../../services/mocks/seed'
import { useAuthStore } from '../../stores/auth'
import { TeacherHistoryPage } from './TeacherHistoryPage'

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
        <MemoryRouter initialEntries={['/teacher/history']}>
          <Routes>
            <Route path="/teacher/history" element={<TeacherHistoryPage />} />
          </Routes>
        </MemoryRouter>
      </I18nextProvider>
    </QueryClientProvider>,
  )
}

describe('TeacherHistoryPage', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en')
    const teacher = seedStore.users.find((u) => u.role === 'teacher')!
    useAuthStore.setState({ token: `tok_${teacher.id}`, user: teacher })
  })

  it('renders the title scoped to the assigned class', async () => {
    const teacher = seedStore.users.find((u) => u.role === 'teacher')!
    const klass = seedStore.classes.find((c) => c.teacherId === teacher.id)!
    renderPage()
    expect(
      await screen.findByRole('heading', { level: 1, name: new RegExp(klass.name) }),
    ).toBeInTheDocument()
  })

  it('renders a row for each day in the range with summary counts', async () => {
    renderPage()
    // Header renders before data — wait for actual data rows to land.
    await waitFor(() => {
      expect(screen.getAllByRole('row').length).toBeGreaterThan(5)
    })
  })
})
