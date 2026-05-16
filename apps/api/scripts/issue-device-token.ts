import 'dotenv/config'
import { db, pool } from '../src/db/client.js'
import { devices, deviceTokens } from '../src/db/schema/devices.js'
import { newId } from '../src/lib/ids.js'
import { hashToken, newDeviceToken } from '../src/lib/tokens.js'
import { eq } from 'drizzle-orm'

async function run() {
  const label = process.argv[2] ?? 'Main Gate'
  const dev = (await db.select().from(devices).where(eq(devices.label, label)).limit(1))[0]
  if (!dev) {
    console.error(`device with label "${label}" not found`)
    process.exit(1)
  }
  const plain = newDeviceToken()
  await db.insert(deviceTokens).values({
    id: newId(),
    deviceId: dev.id,
    schoolId: dev.schoolId,
    tokenHash: hashToken(plain),
    label: `${label} dev token (re-issued ${new Date().toISOString().slice(0, 10)})`,
  })
  console.log('')
  console.log(`device : ${dev.id} (${dev.label})`)
  console.log(`token  : ${plain}`)
  console.log('')
}

run()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => pool.end())
