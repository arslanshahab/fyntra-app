import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { I18nextProvider } from 'react-i18next'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { setupServer } from 'msw/node'
import { http, HttpResponse } from 'msw'
import type { TapEvent } from '@fyntra/schemas'

import i18n from '../../i18n'
import { handlers } from '../../services/mocks/handlers'
import { seedStore } from '../../services/mocks/seed'
import { useAuthStore } from '../../stores/auth'
import { LiveTapFeed } from './LiveTapFeed'

const server = setupServer(...handlers)

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => {
  server.resetHandlers()
  useAuthStore.setState({ token: null, user: null })
})
afterAll(() => server.close())

function renderFeed() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(
    <QueryClientProvider client={client}>
      <I18nextProvider i18n={i18n}>
        <LiveTapFeed school={seedStore.school} />
      </I18nextProvider>
    </QueryClientProvider>,
  )
}

function authAsAdmin() {
  const admin = seedStore.users.find((u) => u.role === 'admin')!
  useAuthStore.setState({ token: `tok_${admin.id}`, user: admin })
}

function makeTapEvent(overrides: Partial<TapEvent>): TapEvent {
  return {
    id: 'tap_test',
    cardId: 'card_x',
    rfidUid: 'uid_x',
    deviceId: 'dev_main',
    direction: 'in',
    occurredAt: new Date().toISOString(),
    source: 'device',
    ...overrides,
  } as TapEvent
}

describe('LiveTapFeed', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en')
    authAsAdmin()
  })

  it('renders the live feed title and seed events', async () => {
    renderFeed()
    expect(await screen.findByText('Live tap feed')).toBeInTheDocument()
  })

  it('loads the next page when "Load earlier" is clicked', async () => {
    // Build two synthetic pages so the cursor header is exercised.
    const pageOne: TapEvent[] = [
      makeTapEvent({ id: 'tap_a', occurredAt: '2025-12-01T10:00:00.000+05:00' }),
      makeTapEvent({ id: 'tap_b', occurredAt: '2025-12-01T09:50:00.000+05:00' }),
    ]
    const pageTwo: TapEvent[] = [
      makeTapEvent({ id: 'tap_c', occurredAt: '2025-12-01T09:40:00.000+05:00' }),
    ]
    let calls = 0
    server.use(
      http.get('*/api/tap-events', ({ request }) => {
        calls++
        const url = new URL(request.url)
        const cursor = url.searchParams.get('cursor')
        if (!cursor) {
          return HttpResponse.json(pageOne, { headers: { 'x-next-cursor': 'tap_b' } })
        }
        if (cursor === 'tap_b') return HttpResponse.json(pageTwo)
        return HttpResponse.json([])
      }),
    )

    const user = userEvent.setup()
    renderFeed()

    // First page rendered.
    await waitFor(() => {
      expect(screen.getAllByRole('listitem')).toHaveLength(2)
    })

    const loadMore = await screen.findByRole('button', { name: /load earlier/i })
    await user.click(loadMore)

    await waitFor(() => {
      expect(screen.getAllByRole('listitem')).toHaveLength(3)
    })
    expect(calls).toBeGreaterThanOrEqual(2)
  })

  it('hides the load-earlier button at end of list', async () => {
    server.use(
      http.get('*/api/tap-events', () =>
        HttpResponse.json([
          makeTapEvent({ id: 'tap_only', occurredAt: '2025-12-01T10:00:00.000+05:00' }),
        ]),
      ),
    )
    renderFeed()
    await waitFor(() => {
      expect(screen.getAllByRole('listitem')).toHaveLength(1)
    })
    expect(screen.queryByRole('button', { name: /load earlier/i })).not.toBeInTheDocument()
    expect(screen.getByText('No earlier events')).toBeInTheDocument()
  })

  it('shows "(removed device)" when a tap references an unknown device id', async () => {
    server.use(
      http.get('*/api/tap-events', () =>
        HttpResponse.json([
          makeTapEvent({
            id: 'tap_ghost',
            deviceId: 'dev_does_not_exist',
            occurredAt: '2025-12-01T10:00:00.000+05:00',
          }),
        ]),
      ),
    )
    renderFeed()
    await waitFor(() => {
      expect(screen.getByText(/\(removed device\)/i)).toBeInTheDocument()
    })
  })
})
