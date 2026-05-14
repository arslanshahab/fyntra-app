import { NotFoundError } from '../../lib/errors.js'
import type { TenantContext } from '../../types/tenant-context.js'
import { devicesRepo } from './repository.js'

interface DeviceWire {
  id: string
  schoolId: string
  label: string
  direction: 'in' | 'out' | 'both'
  status: 'online' | 'offline'
  lastHeartbeat: string
}

function toWire(d: Awaited<ReturnType<typeof devicesRepo.findById>>): DeviceWire {
  return {
    id: d!.id,
    schoolId: d!.schoolId,
    label: d!.label,
    direction: d!.direction,
    status: d!.status,
    lastHeartbeat: d!.lastHeartbeat.toISOString(),
  }
}

export async function listDevices(ctx: TenantContext) {
  const rows = await devicesRepo.list(ctx)
  return rows.map((r) => ({
    id: r.id,
    schoolId: r.schoolId,
    label: r.label,
    direction: r.direction,
    status: r.status,
    lastHeartbeat: r.lastHeartbeat.toISOString(),
  }))
}

export async function getDevice(ctx: TenantContext, id: string) {
  const d = await devicesRepo.findById(ctx, id)
  if (!d) throw new NotFoundError('Device not found')
  return toWire(d)
}
