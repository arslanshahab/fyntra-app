import { and, eq, lt } from 'drizzle-orm'
import cron from 'node-cron'
import { db } from '../db/client.js'
import { devices } from '../db/schema/devices.js'
import { broker, channels } from './realtime.js'

const HEARTBEAT_STALE_MS = 180_000

export async function sweepStaleDevices(now: Date = new Date()): Promise<void> {
  const cutoff = new Date(now.getTime() - HEARTBEAT_STALE_MS)
  const stale = await db
    .select()
    .from(devices)
    .where(and(eq(devices.status, 'online'), lt(devices.lastHeartbeat, cutoff)))
  if (stale.length === 0) return
  for (const d of stale) {
    await db.update(devices).set({ status: 'offline' }).where(eq(devices.id, d.id))
    broker.publish(channels.school(d.schoolId), {
      type: 'device_status',
      deviceId: d.id,
      status: 'offline',
      lastHeartbeat: d.lastHeartbeat.toISOString(),
    })
  }
}

let task: cron.ScheduledTask | null = null
export function startHeartbeatSweep() {
  if (task) return
  task = cron.schedule('*/30 * * * * *', () => {
    sweepStaleDevices().catch(() => {})
  })
}
export function stopHeartbeatSweep() {
  task?.stop()
  task = null
}
