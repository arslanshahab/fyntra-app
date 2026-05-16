import { describe, it, expect } from 'vitest'
import { parseEnv } from './env.js'

describe('parseEnv', () => {
  it('returns parsed config for a valid env', () => {
    const result = parseEnv({
      PORT: '3000',
      NODE_ENV: 'development',
      LOG_LEVEL: 'debug',
      DATABASE_URL: 'postgres://x:y@localhost/db',
      JWT_SECRET: 'a'.repeat(32),
      READER_TOKEN_SECRET: 'b'.repeat(32),
      WHATSAPP_PHONE_NUMBER_ID: '1',
      WHATSAPP_ACCESS_TOKEN: 't',
      WHATSAPP_BUSINESS_ACCOUNT_ID: '1',
      WHATSAPP_APP_SECRET: 's',
      WHATSAPP_DRY_RUN: 'true',
      CORS_ORIGIN: 'http://localhost:5173',
    })
    expect(result.PORT).toBe(3000)
    expect(result.NODE_ENV).toBe('development')
    expect(result.WHATSAPP_DRY_RUN).toBe(true)
  })

  it('throws on missing required vars', () => {
    expect(() => parseEnv({})).toThrow(/JWT_SECRET/)
  })

  it('rejects short JWT_SECRET', () => {
    expect(() =>
      parseEnv({
        PORT: '3000',
        NODE_ENV: 'development',
        LOG_LEVEL: 'debug',
        DATABASE_URL: 'postgres://x:y@localhost/db',
        JWT_SECRET: 'short',
        READER_TOKEN_SECRET: 'b'.repeat(32),
        WHATSAPP_PHONE_NUMBER_ID: '1',
        WHATSAPP_ACCESS_TOKEN: 't',
        WHATSAPP_BUSINESS_ACCOUNT_ID: '1',
        WHATSAPP_APP_SECRET: 's',
        WHATSAPP_DRY_RUN: 'true',
        CORS_ORIGIN: 'http://localhost:5173',
      }),
    ).toThrow(/JWT_SECRET/)
  })
})
