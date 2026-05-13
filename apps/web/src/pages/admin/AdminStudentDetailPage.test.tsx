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
import { AdminStudentDetailPage } from './AdminStudentDetailPage'

const server = setupServer(...handlers)

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => {
  server.resetHandlers()
  useAuthStore.setState({ token: null, user: null })
})
afterAll(() => server.close())

function renderDetail(studentId: string) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(
    <QueryClientProvider client={client}>
      <I18nextProvider i18n={i18n}>
        <MemoryRouter initialEntries={[`/admin/students/${studentId}`]}>
          <Routes>
            <Route path="/admin/students/:id" element={<AdminStudentDetailPage />} />
            <Route path="/admin/students" element={<div>Students list</div>} />
          </Routes>
        </MemoryRouter>
      </I18nextProvider>
    </QueryClientProvider>,
  )
}

describe('AdminStudentDetailPage', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en')
    const admin = seedStore.users.find((u) => u.role === 'admin')!
    useAuthStore.setState({ token: `tok_${admin.id}`, user: admin })
  })

  it('renders the student name and roll number', async () => {
    const student = seedStore.students[0]!
    renderDetail(student.id)
    expect(await screen.findByText(student.fullName)).toBeInTheDocument()
    expect(screen.getByText(new RegExp(student.rollNumber))).toBeInTheDocument()
  })

  it('lists each guardian with their phone', async () => {
    const student = seedStore.students[0]!
    renderDetail(student.id)
    const guardian = seedStore.users.find((u) => u.id === student.guardianIds[0])!
    expect(await screen.findByText(guardian.fullName)).toBeInTheDocument()
    expect(screen.getByText(guardian.phone)).toBeInTheDocument()
  })

  it('shows recent attendance entries with status badges', async () => {
    const student = seedStore.students[0]!
    renderDetail(student.id)
    // Wait for student detail to land then assert the section heading.
    await screen.findByText(student.fullName)
    expect(await screen.findByText('Recent attendance (last 14 days)')).toBeInTheDocument()
  })
})
