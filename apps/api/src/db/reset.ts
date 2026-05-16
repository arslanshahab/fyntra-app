import 'dotenv/config'
import { pool } from './client.js'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { drizzle } from 'drizzle-orm/node-postgres'

async function reset() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('db:reset is disabled in production')
  }
  if (process.env.CONFIRM !== 'yes') {
    throw new Error('refusing to drop. set CONFIRM=yes to proceed.')
  }
  await pool.query(
    'DROP SCHEMA IF EXISTS public CASCADE; DROP SCHEMA IF EXISTS drizzle CASCADE; CREATE SCHEMA public;',
  )
  const db = drizzle(pool)
  await migrate(db, { migrationsFolder: './src/db/migrations' })
  console.log('reset + migrated')
  await pool.end()
}

reset().catch((err) => {
  console.error(err)
  process.exit(1)
})
