import { useEffect } from 'react'
import { useQueryClient, type QueryClient } from '@tanstack/react-query'

import type { School } from '@fyntra/schemas'
import { useAuthStore } from '../stores/auth'

// Plan B slice 9: swap the README §6 polling lifecycle for a module-level
// singleton WebSocket. All useRealtime callers share one socket per
// (token, baseWsUrl); a refcount opens it on the first mount and closes it on
// the last unmount. Server-pushed events invalidate the relevant react-query
// roots, so the public hook signature is preserved but refetchInterval is
// always `false` — the WS does the work.

interface ServerMessage {
  type: 'tap' | 'manual_override' | 'absent' | string
}

interface Conn {
  socket: WebSocket | null
  refCount: number
  backoffMs: number
  reconnectTimer: number | null
  closedByCleanup: boolean
  token: string
  url: string
  qc: QueryClient
}

let conn: Conn | null = null
let connKey: string | null = null

function baseWsUrl(): string {
  const fromEnv = import.meta.env.VITE_API_BASE_URL
  if (!fromEnv) return ''
  return fromEnv
    .replace(/\/$/, '')
    .replace(/^http:/, 'ws:')
    .replace(/^https:/, 'wss:')
}

function handleMessage(qc: QueryClient, raw: string): void {
  let data: ServerMessage
  try {
    data = JSON.parse(raw) as ServerMessage
  } catch {
    return
  }
  if (data.type === 'tap' || data.type === 'manual_override') {
    void qc.invalidateQueries({ queryKey: ['attendance'] })
    void qc.invalidateQueries({ queryKey: ['tapEvents'] })
  } else if (data.type === 'absent') {
    void qc.invalidateQueries({ queryKey: ['attendance'] })
  }
}

function connect(c: Conn): void {
  const ws = new WebSocket(`${c.url}/ws?token=${encodeURIComponent(c.token)}`)
  c.socket = ws
  ws.onopen = () => {
    c.backoffMs = 1000
  }
  ws.onmessage = (e: MessageEvent) => {
    handleMessage(c.qc, e.data as string)
  }
  ws.onclose = () => {
    c.socket = null
    if (c.closedByCleanup) return
    // Exponential backoff with ±20% jitter; cap at 10s.
    const jitter = c.backoffMs * (0.8 + Math.random() * 0.4)
    c.reconnectTimer = window.setTimeout(() => {
      c.reconnectTimer = null
      if (!c.closedByCleanup) connect(c)
    }, jitter)
    c.backoffMs = Math.min(c.backoffMs * 2, 10_000)
  }
  ws.onerror = () => {
    // Let onclose handle reconnection.
  }
}

function openOrReuse(token: string, url: string, qc: QueryClient): Conn {
  const key = `${token}|${url}`
  if (conn && connKey === key) {
    // Keep using the existing socket; qc may differ if a new provider was
    // mounted, but in practice the web app uses one global QueryClient.
    return conn
  }
  if (conn) closeConn()
  connKey = key
  conn = {
    socket: null,
    refCount: 0,
    backoffMs: 1000,
    reconnectTimer: null,
    closedByCleanup: false,
    token,
    url,
    qc,
  }
  connect(conn)
  return conn
}

function closeConn(): void {
  if (!conn) return
  conn.closedByCleanup = true
  if (conn.reconnectTimer !== null) {
    window.clearTimeout(conn.reconnectTimer)
    conn.reconnectTimer = null
  }
  conn.socket?.close()
  conn = null
  connKey = null
}

/**
 * Subscribes to the realtime channel for the current auth session. Returns
 * `{ refetchInterval: false }` so existing react-query consumers can keep
 * spreading the result; updates arrive over the WebSocket instead of polling.
 *
 * The `school` argument is unused now but stays in the signature so callers
 * don't have to change.
 */
export function useRealtime(school: School | undefined): { refetchInterval: number | false } {
  void school
  const token = useAuthStore((s) => s.token)
  const qc = useQueryClient()

  useEffect(() => {
    const url = baseWsUrl()
    if (!token || !url) return
    const c = openOrReuse(token, url, qc)
    c.refCount++
    return () => {
      c.refCount--
      if (c.refCount <= 0) closeConn()
    }
  }, [token, qc])

  return { refetchInterval: false }
}
