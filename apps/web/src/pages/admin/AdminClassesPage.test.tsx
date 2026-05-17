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
import { AdminClassesPage } from './AdminClassesPage'

const server = setupServer(...handlers)

// Track initial lengths AND field snapshots so any mutations are cleaned up after each test.
let initialClassesLength: number
let initialUsersLength: number
let classSnapshot: Array<{ id: string; name: string; teacherId: string | null | undefined }>

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))

afterEach(() => {
  server.resetHandlers()
  useAuthStore.setState({ token: null, user: null })
  // Restore seed slices to pre-test length so tests don't bleed state.
  seedStore.classes.length = initialClassesLength
  seedStore.users.length = initialUsersLength
  // Restore in-place field mutations (e.g. teacherId cleared by unassign test).
  for (const snap of classSnapshot) {
    const cls = seedStore.classes.find((c) => c.id === snap.id)
    if (cls) {
      cls.name = snap.name
      cls.teacherId = snap.teacherId
    }
  }
})

afterAll(() => server.close())

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(
    <QueryClientProvider client={client}>
      <I18nextProvider i18n={i18n}>
        <MemoryRouter initialEntries={['/admin/classes']}>
          <Routes>
            <Route path="/admin/classes" element={<AdminClassesPage />} />
          </Routes>
        </MemoryRouter>
      </I18nextProvider>
    </QueryClientProvider>,
  )
}

describe('AdminClassesPage', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en')
    const admin = seedStore.users.find((u) => u.role === 'admin')!
    useAuthStore.setState({ token: `tok_${admin.id}`, user: admin })

    // Record initial lengths and snapshots before any test mutates the seed.
    initialClassesLength = seedStore.classes.length
    initialUsersLength = seedStore.users.length
    classSnapshot = seedStore.classes.map((c) => ({ id: c.id, name: c.name, teacherId: c.teacherId }))
  })

  it('renders rows with name, teacher, and student count', async () => {
    renderPage()
    await screen.findByText(seedStore.classes[0]!.name)
    await waitFor(() => {
      for (const cls of seedStore.classes) {
        expect(screen.getByText(cls.name)).toBeInTheDocument()
        const teacher = seedStore.users.find((u) => u.id === cls.teacherId)!
        expect(screen.getByText(teacher.fullName)).toBeInTheDocument()
      }
      // Student count check: scope by row so the assertion isn't fooled
      // by an identical-looking number elsewhere on the page.
      for (const cls of seedStore.classes) {
        const row = screen.getByText(cls.name).closest('tr')!
        const studentCount = seedStore.students.filter((s) => s.classId === cls.id).length
        expect(within(row).getByText(String(studentCount))).toBeInTheDocument()
      }
    })
  })

  it('add modal flow: fill form with unassigned teacher, submit, modal closes, new class appears', async () => {
    // The seed has 4 teachers all assigned to classes. Add a free teacher.
    const freeTeacher = {
      id: 'usr_t_free',
      role: 'teacher' as const,
      fullName: 'Free Teacher',
      phone: '+923009999999',
      preferredLanguage: 'en' as const,
      schoolId: seedStore.school.id,
    }
    seedStore.users.push(freeTeacher)

    const user = userEvent.setup()
    renderPage()

    // Wait for table to render before opening modal.
    await screen.findByText(seedStore.classes[0]!.name)

    await user.click(screen.getByRole('button', { name: /Add class/i }))

    const dialog = await screen.findByRole('dialog', { name: 'Add class' })

    await user.type(within(dialog).getByLabelText(/Class name/i), 'Grade 5 — Section A')

    const select = within(dialog).getByLabelText(/Class teacher/i)
    await user.selectOptions(select, freeTeacher.id)

    await user.click(within(dialog).getByRole('button', { name: /Add class/i }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(await screen.findByText('Grade 5 — Section A')).toBeInTheDocument()
  })

  it('edit modal preselects current teacher; Save button is disabled until form is dirty', async () => {
    const user = userEvent.setup()
    renderPage()

    const targetClass = seedStore.classes[0]!
    await screen.findByText(targetClass.name)

    // Find the row and click its Edit button.
    const row = screen.getByText(targetClass.name).closest('tr')!
    await user.click(within(row).getByLabelText('Edit'))

    const dialog = await screen.findByRole('dialog', { name: 'Edit class' })

    // The teacher select should preselect the current teacher. Wait for the
    // teachers query to resolve before checking the selected value.
    const currentTeacher = seedStore.users.find((u) => u.id === targetClass.teacherId)!
    const select = within(dialog).getByLabelText(/Class teacher/i) as HTMLSelectElement
    await within(select).findByRole('option', { name: new RegExp(currentTeacher.fullName) })
    expect(select.value).toBe(targetClass.teacherId)

    // Save Changes button should be disabled when the form matches the current class.
    const saveBtn = within(dialog).getByRole('button', { name: /Save changes/i })
    expect(saveBtn).toBeDisabled()

    // Changing the name makes the form dirty — Save should become enabled.
    const nameInput = within(dialog).getByLabelText(/Class name/i)
    await user.clear(nameInput)
    await user.type(nameInput, 'Renamed Class')

    expect(saveBtn).not.toBeDisabled()
  })

  it('delete modal disables confirm button when the class has students', async () => {
    const user = userEvent.setup()
    renderPage()

    // Every seeded class has students, so use the first one.
    const targetClass = seedStore.classes[0]!
    const studentCount = seedStore.students.filter((s) => s.classId === targetClass.id).length
    expect(studentCount).toBeGreaterThan(0)

    await screen.findByText(targetClass.name)
    const row = screen.getByText(targetClass.name).closest('tr')!
    await user.click(within(row).getByLabelText('Delete'))

    const dialog = await screen.findByRole('dialog', { name: `Delete ${targetClass.name}?` })
    const confirmBtn = within(dialog).getByRole('button', { name: /Delete class/i })
    expect(confirmBtn).toBeDisabled()
  })

  it('edit modal can clear a teacher assignment via "Unassigned"', async () => {
    const user = userEvent.setup()
    renderPage()
    const target = seedStore.classes[0]!
    await screen.findByText(target.name)

    // Open edit on the first class.
    const row = screen.getByText(target.name).closest('tr')!
    await user.click(within(row).getByLabelText('Edit'))

    // Wait for the picker to populate.
    const select = (await screen.findByLabelText(/Class teacher/i)) as HTMLSelectElement
    await within(select).findByRole('option', { name: /No class teacher/i })

    // Switch to the Unassigned option.
    await user.selectOptions(select, '__unassigned__')

    const saveBtn = screen.getByRole('button', { name: /Save changes/i })
    expect(saveBtn).not.toBeDisabled()
    await user.click(saveBtn)

    // Modal closes on success.
    await waitFor(() => expect(screen.queryByRole('button', { name: /Save changes/i })).not.toBeInTheDocument())

    // Seed store now reflects the unassigned class.
    expect(seedStore.classes.find((c) => c.id === target.id)?.teacherId).toBeNull()
  })

  it('teacher picker marks already-assigned teachers as disabled with "(already teaches X)" suffix', async () => {
    // Add a free teacher so the select is not entirely disabled.
    const freeTeacher = {
      id: 'usr_t_free2',
      role: 'teacher' as const,
      fullName: 'Free Teacher Two',
      phone: '+923008888888',
      preferredLanguage: 'en' as const,
      schoolId: seedStore.school.id,
    }
    seedStore.users.push(freeTeacher)

    const user = userEvent.setup()
    renderPage()

    await screen.findByText(seedStore.classes[0]!.name)

    await user.click(screen.getByRole('button', { name: /Add class/i }))
    const dialog = await screen.findByRole('dialog', { name: 'Add class' })

    const select = within(dialog).getByLabelText(/Class teacher/i)

    // Wait for the free teacher's option to appear, confirming the teachers
    // query has resolved before we inspect the disabled options.
    await within(select).findByRole('option', { name: new RegExp(freeTeacher.fullName) })

    const options = within(select).getAllByRole('option')

    // Every teacher that already has a class should appear as a disabled option
    // with the "(already teaches <name>)" suffix.
    for (const cls of seedStore.classes) {
      const assignedTeacher = seedStore.users.find((u) => u.id === cls.teacherId)!
      const matchingOption = options.find((opt) => (opt as HTMLOptionElement).value === assignedTeacher.id)
      expect(matchingOption).toBeDefined()
      expect(matchingOption).toBeDisabled()
      expect(matchingOption!.textContent).toContain(`(already teaches ${cls.name})`)
    }

    // The free teacher's option should be enabled.
    const freeOption = options.find((opt) => (opt as HTMLOptionElement).value === freeTeacher.id)
    expect(freeOption).toBeDefined()
    expect(freeOption).not.toBeDisabled()
  })
})
