import type { FastifyPluginAsync } from 'fastify'
import websocket from '@fastify/websocket'
import { broker, channels } from '../services/realtime.js'
import { db } from '../db/client.js'
import { studentGuardians } from '../db/schema/students.js'
import { and, eq } from 'drizzle-orm'

export const wsRoutes: FastifyPluginAsync = async (app) => {
  await app.register(websocket)
  app.get('/ws', { websocket: true }, async (socket, req) => {
    const tokenQ = (req.query as { token?: string })?.token
    if (!tokenQ) {
      socket.close(4001, 'missing token')
      return
    }
    let payload: { userId: string; schoolId: string; role: 'parent' | 'admin' | 'teacher' }
    try {
      payload = app.jwt.verify(tokenQ)
    } catch {
      socket.close(4001, 'invalid token')
      return
    }
    const unsubs: Array<() => void> = []
    const send = (m: unknown) => {
      try {
        socket.send(JSON.stringify(m))
      } catch {
        /* ignore */
      }
    }
    if (payload.role === 'admin' || payload.role === 'teacher') {
      unsubs.push(broker.subscribe(channels.school(payload.schoolId), send))
    } else {
      const rows = await db
        .select({ studentId: studentGuardians.studentId })
        .from(studentGuardians)
        .where(
          and(
            eq(studentGuardians.schoolId, payload.schoolId),
            eq(studentGuardians.userId, payload.userId),
          ),
        )
      for (const r of rows) {
        unsubs.push(broker.subscribe(channels.student(r.studentId), send))
      }
    }
    socket.on('close', () => {
      for (const u of unsubs) u()
    })
  })
}
