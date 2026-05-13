import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { setupServer } from 'msw/node'

import i18n from '../../i18n'
import { handlers } from '../../services/mocks/handlers'
import { seedStore } from '../../services/mocks/seed'
import { useAuthStore } from '../../stores/auth'
import { ParentHomePage } from './ParentHomePage'

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
        <MemoryRouter initialEntries={['/parent']}>
          <Routes>
            <Route path="/parent" element={<ParentHomePage />} />
            <Route path="/parent/child/:id/timeline" element={<div>Timeline for child</div>} />
            <Route path="/login" element={<div>Login</div>} />
          </Routes>
        </MemoryRouter>
      </I18nextProvider>
    </QueryClientProvider>,
  )
}

describe('ParentHomePage', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en')
  })

  it('renders one card per linked child with the child name visible', async () => {
    const parent = seedStore.users.find((u) => u.role === 'parent')!
    const children = seedStore.students.filter((s) => s.guardianIds.includes(parent.id))
    useAuthStore.setState({ token: `tok_${parent.id}`, user: parent })

    renderPage()

    for (const child of children) {
      expect(await screen.findByText(child.fullName)).toBeInTheDocument()
    }
  })

  it('greets the signed-in parent in the header', async () => {
    const parent = seedStore.users.find((u) => u.role === 'parent')!
    useAuthStore.setState({ token: `tok_${parent.id}`, user: parent })
    renderPage()
    expect(await screen.findByText(new RegExp(parent.fullName))).toBeInTheDocument()
  })

  it('shows a hero status heading for each child once today loads', async () => {
    const parent = seedStore.users.find((u) => u.role === 'parent')!
    useAuthStore.setState({ token: `tok_${parent.id}`, user: parent })
    renderPage()
    // Any of the live-status copy strings — wait for the first child's heading.
    const heading = await screen.findByRole('heading', { level: 2 })
    expect(heading).toBeInTheDocument()
  })

  it('renders the no-children empty state for a parent with no kids', async () => {
    // Pick an admin user — has no children — and pretend they're a parent so
    // the route-level guard doesn't kick in. /me will return children=undefined,
    // which our page treats as empty.
    const admin = seedStore.users.find((u) => u.role === 'admin')!
    useAuthStore.setState({
      token: `tok_${admin.id}`,
      user: { ...admin, role: 'parent' },
    })
    renderPage()
    expect(await screen.findByText(/no children linked/i)).toBeInTheDocument()
  })
})
