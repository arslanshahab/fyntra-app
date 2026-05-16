import { type LoggerOptions } from 'pino'
import { env } from '../config/env.js'

export function buildLoggerOptions(): LoggerOptions {
  const { NODE_ENV, LOG_LEVEL } = env()
  const base: LoggerOptions = {
    level: LOG_LEVEL,
    redact: {
      paths: [
        'req.headers.authorization',
        'req.headers.cookie',
        'req.query.token',
        'req.body.password',
        'req.body.otp',
        'req.body.token',
        'req.body.deviceToken',
        'res.headers["set-cookie"]',
      ],
      remove: false,
    },
  }
  if (NODE_ENV === 'development') {
    return {
      ...base,
      transport: {
        target: 'pino-pretty',
        options: { colorize: true, translateTime: 'SYS:HH:MM:ss.l', ignore: 'pid,hostname' },
      },
    }
  }
  return base
}
