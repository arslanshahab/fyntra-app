import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'

import i18n from '../../i18n'
import { AttendanceSummaryCard } from './AttendanceSummaryCard'
import type { StudentAttendanceSummary } from '@fyntra/schemas'

const SAMPLE: StudentAttendanceSummary = {
  studentId: 'std_1',
  month: {
    period: '2026-05',
    counts: {
      workingDays: 21,
      present: 18,
      absent: 2,
      late: 1,
      halfDay: 0,
      excused: 0,
      attendancePct: 90.5,
    },
  },
  year: {
    from: '2026-01-01',
    to: '2026-05-17',
    counts: {
      workingDays: 90,
      present: 80,
      absent: 5,
      late: 4,
      halfDay: 1,
      excused: 0,
      attendancePct: 93.9,
    },
  },
}

function renderCard(variant: 'inline' | 'panel') {
  return render(
    <I18nextProvider i18n={i18n}>
      <AttendanceSummaryCard summary={SAMPLE} variant={variant} />
    </I18nextProvider>,
  )
}

describe('AttendanceSummaryCard', () => {
  it('panel variant shows both month and year-to-date sections', async () => {
    await i18n.changeLanguage('en')
    renderCard('panel')
    expect(screen.getByText('Attendance summary')).toBeInTheDocument()
    expect(screen.getByText('This month')).toBeInTheDocument()
    expect(screen.getByText('Year to date')).toBeInTheDocument()
    expect(screen.getByText('91%')).toBeInTheDocument() // 90.5% rounds to 91
    expect(screen.getByText('94%')).toBeInTheDocument() // 93.9% rounds to 94
  })

  it('inline variant renders a compact one-line strip', async () => {
    await i18n.changeLanguage('en')
    renderCard('inline')
    // Has the inline This month: label
    expect(screen.getByText(/This month/i)).toBeInTheDocument()
    // Doesn't render the bigger panel title
    expect(screen.queryByText('Attendance summary')).not.toBeInTheDocument()
  })

  it('renders — when attendancePct is null', async () => {
    const empty: StudentAttendanceSummary = {
      ...SAMPLE,
      month: {
        period: '2026-05',
        counts: { ...SAMPLE.month.counts, attendancePct: null, workingDays: 0 },
      },
    }
    await i18n.changeLanguage('en')
    render(
      <I18nextProvider i18n={i18n}>
        <AttendanceSummaryCard summary={empty} />
      </I18nextProvider>,
    )
    expect(screen.getAllByText('—').length).toBeGreaterThan(0)
  })
})
