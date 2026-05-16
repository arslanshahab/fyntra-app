import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { authRepo } from './repository.js'
import { sendTemplate } from '../../services/whatsapp.js'
import { UnauthorizedError, ValidationError } from '../../lib/errors.js'
import { env } from '../../config/env.js'

const OTP_TTL_MS = 5 * 60 * 1000
const MAX_ATTEMPTS = 3

function generateOtp(): string {
  // 0000..9999, zero-padded
  return String(randomBytes(2).readUInt16BE(0) % 10000).padStart(4, '0')
}

function hashOtp(code: string, salt: string): string {
  return createHash('sha256').update(`${salt}:${code}`).digest('hex')
}

export async function requestOtp(phone: string): Promise<{ ok: true }> {
  if (!/^\+\d{8,15}$/.test(phone)) throw new ValidationError('Invalid phone format')
  const code = generateOtp()
  const salt = randomBytes(16).toString('hex')
  const codeHash = hashOtp(code, salt)
  const expiresAt = new Date(Date.now() + OTP_TTL_MS)
  await authRepo.insertOtp({ phone, codeHash, salt, expiresAt })

  await sendTemplate({
    to: phone,
    name: 'fyntra_otp',
    languageCode: 'en',
    variables: [code],
  })
  return { ok: true }
}

export interface VerifyOtpResult {
  userId: string
  schoolId: string
  role: 'parent' | 'admin' | 'teacher'
  user: {
    id: string
    role: 'parent' | 'admin' | 'teacher'
    fullName: string
    phone: string
    email?: string
    preferredLanguage: 'en' | 'ur'
    schoolId: string
  }
}

function toVerifyResult(user: NonNullable<Awaited<ReturnType<typeof authRepo.findUserByPhone>>>): VerifyOtpResult {
  return {
    userId: user.id,
    schoolId: user.schoolId,
    role: user.role,
    user: {
      id: user.id,
      role: user.role,
      fullName: user.fullName,
      phone: user.phone,
      email: user.email ?? undefined,
      preferredLanguage: user.preferredLanguage,
      schoolId: user.schoolId,
    },
  }
}

export async function verifyOtp(phone: string, otp: string): Promise<VerifyOtpResult> {
  if (!/^\d{4}$/.test(otp)) throw new ValidationError('Invalid OTP format')

  // Dev backdoor: when DEV_OTP_BACKDOOR=true, '0000' authenticates any seeded
  // user so demos and local dev aren't blocked. Decoupled from WHATSAPP_DRY_RUN
  // so a tester can flip dry-run off (to verify real template delivery) while
  // still logging in via the backdoor. Defaults to false; production must
  // never enable it. Also gated on NODE_ENV !== 'test' so the test suite
  // exercises the real OTP flow.
  const e = env()
  if (e.DEV_OTP_BACKDOOR && e.NODE_ENV !== 'test' && otp === '0000') {
    const user = await authRepo.findUserByPhone(phone)
    if (!user) throw new UnauthorizedError('No account for this phone')
    return toVerifyResult(user)
  }

  const now = new Date()
  const row = await authRepo.findActiveOtp(phone, now)
  if (!row) throw new UnauthorizedError('OTP invalid or expired')
  const candidateHash = hashOtp(otp, row.salt)
  const stored = Buffer.from(row.codeHash, 'hex')
  const candidate = Buffer.from(candidateHash, 'hex')
  const matches = stored.length === candidate.length && timingSafeEqual(stored, candidate)
  if (!matches) {
    const attempts = await authRepo.incrementOtpAttempts(row.id)
    if (attempts >= MAX_ATTEMPTS) await authRepo.markOtpConsumed(row.id, now)
    throw new UnauthorizedError('OTP invalid or expired')
  }
  await authRepo.markOtpConsumed(row.id, now)

  const user = await authRepo.findUserByPhone(phone)
  if (!user) throw new UnauthorizedError('No account for this phone')
  return toVerifyResult(user)
}
