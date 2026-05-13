import { z } from 'zod'

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3000),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 chars'),
  READER_TOKEN_SECRET: z.string().min(32, 'READER_TOKEN_SECRET must be at least 32 chars'),
  WHATSAPP_PHONE_NUMBER_ID: z.string().min(1),
  WHATSAPP_ACCESS_TOKEN: z.string().min(1),
  WHATSAPP_BUSINESS_ACCOUNT_ID: z.string().min(1),
  WHATSAPP_APP_SECRET: z.string().min(1),
  WHATSAPP_DRY_RUN: z
    .union([z.literal('true'), z.literal('false')])
    .default('true')
    .transform((v) => v === 'true'),
  CORS_ORIGIN: z.string().min(1),
})

export type Env = z.infer<typeof envSchema>

export function parseEnv(source: NodeJS.ProcessEnv | Record<string, string | undefined>): Env {
  const result = envSchema.safeParse(source)
  if (!result.success) {
    const flat = result.error.flatten().fieldErrors
    const lines = Object.entries(flat)
      .map(([k, msgs]) => `  - ${k}: ${msgs?.join(', ')}`)
      .join('\n')
    throw new Error(`Invalid environment configuration:\n${lines}`)
  }
  return result.data
}

let cached: Env | null = null
export function env(): Env {
  if (!cached) cached = parseEnv(process.env)
  return cached
}

// Test-only — clears the memoized env so a test can mutate process.env and re-read.
export function _resetEnvCacheForTests(): void {
  cached = null
}
