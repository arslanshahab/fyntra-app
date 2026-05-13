import type { ZodTypeAny, z } from 'zod'

import { useAuthStore } from '../../stores/auth'

// Thrown for any non-2xx response. Carries the raw body so callers can
// distinguish 401 (unauthenticated) from 403 / 404 / 500 without re-fetching.
export class ApiError extends Error {
  readonly status: number
  readonly body: unknown
  constructor(message: string, status: number, body: unknown) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.body = body
  }
}

const DEFAULT_BASE = '/api'

function baseUrl(): string {
  const fromEnv = import.meta.env.VITE_API_BASE_URL
  if (!fromEnv) return DEFAULT_BASE
  // Allow either an absolute URL or a path prefix in the env var.
  return fromEnv.replace(/\/$/, '')
}

async function parseBody(res: Response): Promise<unknown> {
  const ct = res.headers.get('content-type') ?? ''
  if (ct.includes('application/json')) return res.json()
  return res.text()
}

async function request(method: string, path: string, body?: unknown): Promise<unknown> {
  const headers: Record<string, string> = {}
  const token = useAuthStore.getState().token
  if (token) headers.authorization = `Bearer ${token}`
  if (body !== undefined) headers['content-type'] = 'application/json'

  const res = await fetch(`${baseUrl()}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })

  const parsed = await parseBody(res)
  if (!res.ok) {
    throw new ApiError(`${method} ${path} → ${res.status}`, res.status, parsed)
  }
  return parsed
}

// Every API call must pass a Zod schema. Per README §12: "Validate every
// API response against a Zod schema before it enters Query state." There
// is no overload that skips validation — keeping the contract honest.

export async function apiGet<S extends ZodTypeAny>(path: string, schema: S): Promise<z.infer<S>> {
  return schema.parse(await request('GET', path)) as z.infer<S>
}

export async function apiPost<S extends ZodTypeAny>(
  path: string,
  body: unknown,
  schema: S,
): Promise<z.infer<S>> {
  return schema.parse(await request('POST', path, body)) as z.infer<S>
}

export async function apiPatch<S extends ZodTypeAny>(
  path: string,
  body: unknown,
  schema: S,
): Promise<z.infer<S>> {
  return schema.parse(await request('PATCH', path, body)) as z.infer<S>
}
