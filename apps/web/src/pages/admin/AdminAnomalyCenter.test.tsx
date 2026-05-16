import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { I18nextProvider } from 'react-i18next'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'

import i18n from '../../i18n'
import { handlers } from '../../services/mocks/handlers'
import { seedStore } from '../../services/mocks/seed'
import { useAuthStore } from '../../stores/auth'
import { AdminAnomalyCenter } from './AdminAnomalyCenter'

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
        <MemoryRouter initialEntries={['/admin/anomalies']}>
          <Routes>
            <Route path="/admin/anomalies" element={<AdminAnomalyCenter />} />
          </Routes>
        </MemoryRouter>
      </I18nextProvider>
    </QueryClientProvider>,
  )
}

describe('AdminAnomalyCenter', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en')
    const admin = seedStore.users.find((u) => u.role === 'admin')!
    useAuthStore.setState({ token: `tok_${admin.id}`, user: admin })
  })

  it('renders the zero-state when no anomalies are returned', async () => {
    server.use(http.get('*/api/attendance', () => HttpResponse.json([])))
    renderPage()
    expect(
      await screen.findByText(/no anomalies in this range\. nice and quiet\./i),
    ).toBeInTheDocument()
  })

  it('renders rows with the matching reason chips', async () => {
    const student = seedStore.students[0]!
    const today = new Date().toISOString().slice(0, 10)
    server.use(
      http.get('*/api/attendance', () =>
        HttpResponse.json([
          {
            id: 'att_fixture_1',
            studentId: student.id,
            date: today,
            status: 'present',
            isManual: false,
            cardAnomaly: true,
          },
          {
            id: 'att_fixture_2',
            studentId: student.id,
            date: today,
            status: 'present',
            isManual: false,
            leftWithoutScan: true,
            flaggedForReview: true,
          },
        ]),
      ),
    )

    renderPage()

    await waitFor(() => {
      expect(screen.getAllByText(/card swapped/i).length).toBeGreaterThan(0)
      expect(screen.getAllByText(/no tap-out/i).length).toBeGreaterThan(0)
      expect(screen.getAllByText(/needs review/i).length).toBeGreaterThan(0)
    })
  })

  it('refetches with new query params when the from-date input changes', async () => {
    const user = userEvent.setup()
    const seen: string[] = []
    server.use(
      http.get('*/api/attendance', ({ request }) => {
        seen.push(new URL(request.url).search)
        return HttpResponse.json([])
      }),
    )

    renderPage()

    // Wait for the initial fetch.
    await waitFor(() => {
      expect(seen.length).toBeGreaterThan(0)
    })
    expect(seen[0]).toContain('anomalies=true')

    const fromInput = screen.getByLabelText(/^from$/i) as HTMLInputElement
    await user.clear(fromInput)
    await user.type(fromInput, '2024-01-01')

    await waitFor(() => {
      expect(seen.some((s) => s.includes('from=2024-01-01'))).toBe(true)
    })
  })
})
