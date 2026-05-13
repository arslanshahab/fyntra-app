import { describe, it, expect, beforeEach } from 'vitest'
import { truncateAll } from '../../../tests/helpers/db.js'
import { db } from '../../db/client.js'
import { schools, classes } from '../../db/schema/schools.js'
import { users } from '../../db/schema/auth.js'
import { newId } from '../../lib/ids.js'
import { requestOtp, verifyOtp } from './service.js'
import { authRepo } from './repository.js'

const phone = '+923001000099'

async function seedUser() {
  const schoolId = newId()
  const teacherId = newId()
  const userId = newId()
  await db.insert(schools).values({
    id: schoolId,
    name: 's',
    address: 'a',
    startTime: '07:45',
    endTime: '13:30',
    lateThresholdMinutes: 10,
    absentThresholdMinutes: 30,
  })
  await db.insert(users).values({
    id: teacherId,
    schoolId,
    role: 'teacher',
    fullName: 'T',
    phone: '+923001200099',
    preferredLanguage: 'en',
  })
  await db.insert(classes).values({
    id: newId(),
    schoolId,
    name: 'c',
    teacherId,
  })
  await db.insert(users).values({
    id: userId,
    schoolId,
    role: 'parent',
    fullName: 'P',
    phone,
    preferredLanguage: 'en',
  })
  return { schoolId, userId }
}

describe('auth service', () => {
  beforeEach(async () => {
    await truncateAll()
  })

  it('issues OTP and verifies happy path', async () => {
    await seedUser()
    await requestOtp(phone)
    const row = await authRepo.findActiveOtp(phone, new Date())
    expect(row).toBeDefined()
    // Reconstruct the plaintext code by brute force (0000..9999) using the salt and hash.
    const { createHash } = await import('node:crypto')
    let code: string | null = null
    for (let i = 0; i < 10000; i++) {
      const candidate = String(i).padStart(4, '0')
      const hash = createHash('sha256').update(`${row!.salt}:${candidate}`).digest('hex')
      if (hash === row!.codeHash) {
        code = candidate
        break
      }
    }
    expect(code).not.toBeNull()
    const result = await verifyOtp(phone, code!)
    expect(result.user.phone).toBe(phone)
    expect(result.user.role).toBe('parent')
  })

  it('rejects wrong OTP and bumps attempts', async () => {
    await seedUser()
    await requestOtp(phone)
    await expect(verifyOtp(phone, '0000')).rejects.toThrow(/invalid or expired/i)
    const row = await authRepo.findActiveOtp(phone, new Date())
    expect(row?.attempts).toBe(1)
  })

  it('locks after 3 attempts', async () => {
    await seedUser()
    await requestOtp(phone)
    await expect(verifyOtp(phone, '0000')).rejects.toThrow()
    await expect(verifyOtp(phone, '0001')).rejects.toThrow()
    await expect(verifyOtp(phone, '0002')).rejects.toThrow()
    const row = await authRepo.findActiveOtp(phone, new Date())
    expect(row).toBeUndefined() // consumed after lockout
  })

  it('rejects unknown phone', async () => {
    await expect(verifyOtp('+923001000098', '1234')).rejects.toThrow(/invalid or expired/i)
  })
})
