import { beforeAll, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { I18nextProvider } from 'react-i18next'

import i18n from '../../i18n'
import type { Student } from '@fyntra/schemas'
import { ChildCard } from './ChildCard'

const student: Student = {
  id: 'std_1',
  fullName: 'Ahmad Khan',
  rollNumber: 'C1-01',
  classId: 'cls_1',
  schoolId: 'sch_1',
  guardianIds: ['usr_p_1'],
  cardId: 'crd_1',
  status: 'active',
}

function renderCard(status: Parameters<typeof ChildCard>[0]['status'], onOpenTimeline = vi.fn()) {
  return {
    ...render(
      <I18nextProvider i18n={i18n}>
        <ChildCard student={student} status={status} onOpenTimeline={onOpenTimeline} />
      </I18nextProvider>,
    ),
    onOpenTimeline,
  }
}

beforeAll(async () => {
  await i18n.changeLanguage('en')
})

describe('ChildCard', () => {
  it('renders "at school" with the arrival time in PKT', () => {
    renderCard({ kind: 'at_school', firstInAt: '2026-05-11T02:42:00.000Z', isLate: false })
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Ahmad Khan is at school.')
    expect(screen.getByText(/7:42 AM/)).toBeInTheDocument()
  })

  it('renders pre-school with minutes until start', () => {
    renderCard({ kind: 'pre_school', minutesUntilStart: 32 })
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(
      'School starts in 32 minutes.',
    )
  })

  it('renders absent with a clear alarm tone (deep red)', () => {
    renderCard({ kind: 'absent', minutesAfterStart: 45 })
    const heading = screen.getByRole('heading', { level: 2 })
    expect(heading).toHaveTextContent('Ahmad Khan has not arrived.')
    expect(heading.className).toContain('text-status-absent')
  })

  it('renders "no card assigned" rather than absent when cardId is missing', () => {
    renderCard({ kind: 'no_card' })
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(
      "Ahmad Khan's card hasn't been issued yet.",
    )
  })

  it('renders "unverified" when the gate is offline (not absent)', () => {
    renderCard({ kind: 'unverified' })
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(
      "We can't confirm Ahmad Khan's status right now.",
    )
  })

  it('fires onOpenTimeline when the View 30-day history button is clicked', async () => {
    const { onOpenTimeline } = renderCard({
      kind: 'at_school',
      firstInAt: '2026-05-11T02:42:00.000Z',
      isLate: false,
    })
    await userEvent.click(screen.getByRole('button', { name: /30-day history/i }))
    expect(onOpenTimeline).toHaveBeenCalledTimes(1)
  })
})
