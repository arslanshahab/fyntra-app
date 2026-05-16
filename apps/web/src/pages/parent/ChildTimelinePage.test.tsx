import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
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
import { ChildTimelinePage } from './ChildTimelinePage'

const server = setupServer(...handlers)

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => {
  server.resetHandlers()
  useAuthStore.setState({ token: null, user: null })
})
afterAll(() => server.close())

function authAsParent(): string {
  const parent = seedStore.users.find((u) => u.role === 'parent')!
  useAuthStore.setState({ token: `tok_${parent.id}`, user: parent })
  // Their first child:
  const child = seedStore.students.find((s) => s.guardianIds.includes(parent.id))!
  return child.id
}

function renderPage(childId: string) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(
    <QueryClientProvider client={client}>
      <I18nextProvider i18n={i18n}>
        <MemoryRouter initialEntries={[`/parent/child/${childId}`]}>
          <Routes>
            <Route path="/parent/child/:id" element={<ChildTimelinePage />} />
            <Route path="/parent" element={<div>parent home</div>} />
          </Routes>
        </MemoryRouter>
      </I18nextProvider>
    </QueryClientProvider>,
  )
}

describe('ChildTimelinePage — Load earlier', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en')
  })

  it('expands the date window when "Load earlier" is clicked', async () => {
    const childId = authAsParent()
    const seenFromParams: string[] = []
    server.use(
      http.get('*/api/students/:id/timeline', ({ request }) => {
        const url = new URL(request.url)
        const from = url.searchParams.get('from')
        if (from) seenFromParams.push(from)
        // Return one fixed record so the success branch (and Load earlier
        // button) renders. The brief: button lives under the list.
        return HttpResponse.json([
          {
            id: 'att_1',
            studentId: childId,
            date: '2025-11-01',
            status: 'present',
            isManual: false,
            firstInAt: '2025-11-01T08:05:00.000+05:00',
            lastOutAt: '2025-11-01T13:30:00.000+05:00',
          },
        ])
      }),
    )

    const user = userEvent.setup()
    renderPage(childId)

    // Wait for the first request to land.
    await waitFor(() => expect(seenFromParams.length).toBeGreaterThanOrEqual(1))
    const firstFrom = seenFromParams[0]!

    const button = await screen.findByRole('button', { name: /load earlier/i })
    await user.click(button)

    await waitFor(() => expect(seenFromParams.length).toBeGreaterThanOrEqual(2))
    const secondFrom = seenFromParams[seenFromParams.length - 1]!

    // Expanded window: the `from` date moves backwards (lexically smaller).
    expect(secondFrom < firstFrom).toBe(true)
  })
})
