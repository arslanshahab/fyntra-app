import { useEffect, useRef, useState } from 'react'

// Local-only dev bridge that wraps the ACR122U via PC/SC and exposes a
// WebSocket. See README §13. Phase 1 keeps this dev-only; production
// readers will talk to the backend directly in Phase 1.5.
const DEFAULT_URL = 'ws://localhost:8787'
const RECONNECT_MS = 3000

export type BridgeStatus = 'disconnected' | 'connecting' | 'connected'

export interface BridgeScan {
  uid: string
  readerName: string
  timestamp: string
}

interface UseReaderBridgeOptions {
  url?: string
  enabled?: boolean
}

interface CardTappedMessage {
  type: 'card_tapped'
  uid: string
  readerName: string
  timestamp: string
}

function isCardTappedMessage(value: unknown): value is CardTappedMessage {
  if (!value || typeof value !== 'object') return false
  const v = value as Record<string, unknown>
  return (
    v.type === 'card_tapped' &&
    typeof v.uid === 'string' &&
    typeof v.readerName === 'string' &&
    typeof v.timestamp === 'string'
  )
}

// jsdom provides WebSocket but our handler-free bridge URL produces noisy
// connect failures in test runs. The hook is a no-op under Vitest.
const SHOULD_CONNECT = typeof WebSocket !== 'undefined' && import.meta.env.MODE !== 'test'

/**
 * Connects to the ACR122U bridge over WebSocket and exposes the connection
 * status and the most recent scan. Gracefully degrades to 'disconnected'
 * when no bridge is running (admins can still type a UID manually).
 */
export function useReaderBridge({
  url = DEFAULT_URL,
  enabled = true,
}: UseReaderBridgeOptions = {}): {
  status: BridgeStatus
  lastScan: BridgeScan | null
  url: string
} {
  const [status, setStatus] = useState<BridgeStatus>('disconnected')
  const [lastScan, setLastScan] = useState<BridgeScan | null>(null)
  const socketRef = useRef<WebSocket | null>(null)
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!enabled || !SHOULD_CONNECT) return

    let disposed = false

    const scheduleReconnect = () => {
      if (disposed) return
      reconnectTimeoutRef.current = setTimeout(connect, RECONNECT_MS)
    }

    const connect = () => {
      if (disposed) return
      setStatus('connecting')
      let ws: WebSocket
      try {
        ws = new WebSocket(url)
      } catch {
        setStatus('disconnected')
        scheduleReconnect()
        return
      }
      socketRef.current = ws

      ws.addEventListener('open', () => {
        if (disposed) return
        setStatus('connected')
      })
      ws.addEventListener('message', (event) => {
        if (disposed) return
        try {
          const parsed: unknown = JSON.parse(event.data as string)
          if (isCardTappedMessage(parsed)) {
            setLastScan({
              uid: parsed.uid.toUpperCase(),
              readerName: parsed.readerName,
              timestamp: parsed.timestamp,
            })
          }
        } catch {
          // Ignore malformed messages from a misbehaving bridge.
        }
      })
      ws.addEventListener('close', () => {
        if (disposed) return
        setStatus('disconnected')
        scheduleReconnect()
      })
      ws.addEventListener('error', () => {
        // The browser logs the failure; close handler will follow.
      })
    }

    connect()

    return () => {
      disposed = true
      if (reconnectTimeoutRef.current !== null) clearTimeout(reconnectTimeoutRef.current)
      if (socketRef.current) {
        socketRef.current.close()
        socketRef.current = null
      }
    }
  }, [enabled, url])

  return { status, lastScan, url }
}
