import { NotFoundError } from '../../lib/errors.js'
import { newDeviceToken, hashToken } from '../../lib/tokens.js'
import type { TenantContext } from '../../types/tenant-context.js'
import { devicesRepo } from './repository.js'
import { deviceTokensRepo } from './tokens.repository.js'
import { deviceTokens } from '../../db/schema/devices.js'

type DeviceTokenRow = typeof deviceTokens.$inferSelect

interface DeviceTokenWire {
  id: string
  deviceId: string
  label: string
  createdAt: string
  revokedAt?: string
}

function toWire(t: DeviceTokenRow): DeviceTokenWire {
  const wire: DeviceTokenWire = {
    id: t.id,
    deviceId: t.deviceId,
    label: t.label,
    createdAt: t.createdAt.toISOString(),
  }
  if (t.revokedAt) wire.revokedAt = t.revokedAt.toISOString()
  return wire
}

export async function listTokens(ctx: TenantContext, deviceId: string) {
  const device = await devicesRepo.findById(ctx, deviceId)
  if (!device) throw new NotFoundError('Device not found')
  const rows = await deviceTokensRepo.listForDevice(ctx, deviceId)
  return rows.map(toWire)
}

export async function issueToken(
  ctx: TenantContext,
  deviceId: string,
  input: { label: string },
) {
  const device = await devicesRepo.findById(ctx, deviceId)
  if (!device) throw new NotFoundError('Device not found')
  const plaintext = newDeviceToken()
  const tokenHash = hashToken(plaintext)
  const row = await deviceTokensRepo.insertHashed(ctx, deviceId, tokenHash, input.label)
  return { token: plaintext, deviceToken: toWire(row) }
}

export async function revokeToken(
  ctx: TenantContext,
  deviceId: string,
  tokenId: string,
) {
  const device = await devicesRepo.findById(ctx, deviceId)
  if (!device) throw new NotFoundError('Device not found')
  const existing = await deviceTokensRepo.findById(ctx, deviceId, tokenId)
  if (!existing) throw new NotFoundError('Device token not found')
  const updated = await deviceTokensRepo.revoke(ctx, deviceId, tokenId)
  if (!updated) throw new NotFoundError('Device token not found')
  return toWire(updated)
}
