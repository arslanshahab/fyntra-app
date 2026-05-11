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
import { TeacherTodayPage } from './TeacherTodayPage'

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
        <MemoryRouter initialEntries={['/teacher']}>
          <Routes>
            <Route path="/teacher" element={<TeacherTodayPage />} />
          </Routes>
        </MemoryRouter>
      </I18nextProvider>
    </QueryClientProvider>,
  )
}

describe('TeacherTodayPage', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en')
    const teacher = seedStore.users.find((u) => u.role === 'teacher')!
    useAuthStore.setState({ token: `tok_${teacher.id}`, user: teacher })
  })

  it('renders the assigned class name and a roster of 15 students', async () => {
    const teacher = seedStore.users.find((u) => u.role === 'teacher')!
    const klass = seedStore.classes.find((c) => c.teacherId === teacher.id)!
    renderPage()
    expect(await screen.findByRole('heading', { level: 1, name: klass.name })).toBeInTheDocument()
    expect(await screen.findByText(/15 students/i)).toBeInTheDocument()
  })

  it('opens the override dialog when an Override button is clicked', async () => {
    const user = userEvent.setup()
    renderPage()
    const overrides = await screen.findAllByRole('button', { name: /override/i })
    await user.click(overrides[0]!)
    expect(await screen.findByRole('dialog', { name: /manual override/i })).toBeInTheDocument()
    expect(screen.getByLabelText(/reason/i)).toBeRequired()
  })

  it('submits the override and surfaces a success banner', async () => {
    const user = userEvent.setup()
    renderPage()
    const overrides = await screen.findAllByRole('button', { name: /override/i })
    await user.click(overrides[0]!)
    await user.type(screen.getByLabelText(/reason/i), 'Card forgotten at home')
    await user.click(screen.getByRole('button', { name: /record tap/i }))
    await waitFor(() => {
      expect(screen.getByText(/manual tap recorded/i)).toBeInTheDocument()
    })
  })
})
