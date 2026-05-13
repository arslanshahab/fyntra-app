import { describe, it, expect, vi, beforeEach } from 'vitest'
import { _resetEnvCacheForTests } from '../config/env.js'
import { sendTemplate } from './whatsapp.js'

const fetchMock = vi.fn()
beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
  _resetEnvCacheForTests()
})

describe('sendTemplate', () => {
  it('returns dry-run when WHATSAPP_DRY_RUN=true', async () => {
    process.env.WHATSAPP_DRY_RUN = 'true'
    const result = await sendTemplate({
      to: '+923001000001',
      name: 'fyntra_otp',
      languageCode: 'en',
      variables: ['1234'],
    })
    expect(result.dryRun).toBe(true)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
