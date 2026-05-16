import { createHash, randomBytes } from 'node:crypto'

export const newDeviceToken = () => randomBytes(32).toString('base64url')
export const hashToken = (plaintext: string) =>
  createHash('sha256').update(plaintext).digest('hex')
