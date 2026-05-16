import 'dotenv/config'
import { buildApp } from './app.js'
import { env } from './config/env.js'

const start = async () => {
  const app = await buildApp()
  try {
    const e = env()
    await app.listen({ port: e.PORT, host: '0.0.0.0' })
    app.log.info(`api listening on :${e.PORT}`)
  } catch (err) {
    app.log.error({ err }, 'failed to start')
    process.exit(1)
  }
}

void start()
