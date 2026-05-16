import { NotFoundError } from '../../lib/errors.js'
import type { TenantContext } from '../../types/tenant-context.js'
import { devicesRepo } from './repository.js'
import { deviceTokensRepo } from './tokens.repository.js'
import { devices } from '../../db/schema/devices.js'

type DeviceRow = typeof devices.$inferSelect

interface DeviceWire {
  id: string
  schoolId: string
  label: string
  direction: 'in' | 'out' | 'both'
  status: 'online' | 'offline'
  lastHeartbeat: string
}

function toWire(d: DeviceRow): DeviceWire {
  return {
    id: d.id,
    schoolId: d.schoolId,
    label: d.label,
    direction: d.direction,
    status: d.status,
    lastHeartbeat: d.lastHeartbeat.toISOString(),
  }
}

export async function listDevices(ctx: TenantContext) {
  const rows = await devicesRepo.list(ctx)
  return rows.map(toWire)
}

export async function getDevice(ctx: TenantContext, id: string) {
  const d = await devicesRepo.findById(ctx, id)
  if (!d) throw new NotFoundError('Device not found')
  return toWire(d)
}

export async function createDevice(
  ctx: TenantContext,
  input: { label: string; direction: 'in' | 'out' | 'both' },
) {
  const row = await devicesRepo.insert(ctx, input)
  return toWire(row)
}

export async function patchDevice(
  ctx: TenantContext,
  id: string,
  input: { label?: string; direction?: 'in' | 'out' | 'both' },
) {
  const existing = await devicesRepo.findById(ctx, id)
  if (!existing) throw new NotFoundError('Device not found')
  const updated = await devicesRepo.patch(ctx, id, input)
  if (!updated) throw new NotFoundError('Device not found')
  return toWire(updated)
}

export async function softDeleteDevice(ctx: TenantContext, id: string) {
  const existing = await devicesRepo.findById(ctx, id)
  if (!existing) throw new NotFoundError('Device not found')
  const deleted = await devicesRepo.softDelete(ctx, id)
  if (!deleted) throw new NotFoundError('Device not found')
  // Cascade-revoke active tokens so resolveDeviceByToken rejects subsequent
  // taps for this retired device without needing a deletedAt join.
  await deviceTokensRepo.revokeAllForDevice(ctx, id)
  return { ok: true as const }
}
