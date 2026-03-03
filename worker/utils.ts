import type { AccessTokenPayload, Env } from './types'

const TEXT_ENCODER = new TextEncoder()

function toBase64Url(bytes: Uint8Array) {
  let binary = ''
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i])
  }

  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function fromBase64Url(input: string) {
  const normalized = input.replace(/-/g, '+').replace(/_/g, '/')
  const padded = normalized + '='.repeat((4 - (normalized.length % 4 || 4)) % 4)
  const binary = atob(padded)
  const bytes = new Uint8Array(binary.length)

  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i)
  }

  return bytes
}

async function importHmacKey(secret: string) {
  return crypto.subtle.importKey('raw', TEXT_ENCODER.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
    'verify',
  ])
}

export function nowSeconds() {
  return Math.floor(Date.now() / 1000)
}

export function randomToken(bytes = 32) {
  const buffer = new Uint8Array(bytes)
  crypto.getRandomValues(buffer)
  return toBase64Url(buffer)
}

export async function sha256Hex(input: string) {
  const digest = await crypto.subtle.digest('SHA-256', TEXT_ENCODER.encode(input))
  return Array.from(new Uint8Array(digest))
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('')
}

export async function createAccessToken(payload: AccessTokenPayload, secret: string) {
  const encodedPayload = toBase64Url(TEXT_ENCODER.encode(JSON.stringify(payload)))
  const key = await importHmacKey(secret)
  const signatureBytes = await crypto.subtle.sign('HMAC', key, TEXT_ENCODER.encode(encodedPayload))
  const signature = toBase64Url(new Uint8Array(signatureBytes))
  return `v1.${encodedPayload}.${signature}`
}

export async function verifyAccessToken(token: string, secret: string) {
  const parts = token.split('.')
  if (parts.length !== 3 || parts[0] !== 'v1') {
    return null
  }

  const encodedPayload = parts[1]
  const signature = parts[2]
  const key = await importHmacKey(secret)
  const verified = await crypto.subtle.verify('HMAC', key, fromBase64Url(signature), TEXT_ENCODER.encode(encodedPayload))
  if (!verified) {
    return null
  }

  let payload: AccessTokenPayload
  try {
    payload = JSON.parse(new TextDecoder().decode(fromBase64Url(encodedPayload)))
  } catch {
    return null
  }

  if (!payload?.sid || !payload?.email || typeof payload?.exp !== 'number') {
    return null
  }

  if (payload.exp <= nowSeconds()) {
    return null
  }

  return payload
}

export function parseCookies(request: Request) {
  const cookieHeader = request.headers.get('Cookie')
  const cookies = new Map<string, string>()

  if (!cookieHeader) {
    return cookies
  }

  const entries = cookieHeader.split(';')
  for (const entry of entries) {
    const index = entry.indexOf('=')
    if (index < 0) {
      continue
    }
    const key = entry.slice(0, index).trim()
    const value = entry.slice(index + 1).trim()
    cookies.set(key, value)
  }

  return cookies
}

export function readBearerToken(request: Request) {
  const authHeader = request.headers.get('Authorization')
  if (!authHeader) {
    return null
  }
  const match = authHeader.match(/^Bearer\s+(.+)$/i)
  return match?.[1] ?? null
}

export function jsonResponse(data: unknown, status = 200, extraHeaders?: HeadersInit) {
  const headers = new Headers(extraHeaders)
  headers.set('Content-Type', 'application/json; charset=utf-8')
  return new Response(JSON.stringify(data), { status, headers })
}

export function errorResponse(message: string, status = 400, extra?: Record<string, unknown>) {
  return jsonResponse({ ok: false, message, ...(extra ?? {}) }, status)
}

export async function readJsonBody<T>(request: Request) {
  try {
    return (await request.json()) as T
  } catch {
    return null
  }
}

export function getAllowedOrigins(env: Env) {
  const origins = new Set<string>()
  if (env.APP_ORIGIN) {
    origins.add(env.APP_ORIGIN)
  }
  origins.add('http://localhost:5173')
  origins.add('http://127.0.0.1:5173')
  return origins
}

export function appendCorsHeaders(response: Response, request: Request, env: Env) {
  const origin = request.headers.get('Origin')
  if (!origin) {
    return response
  }

  const allowedOrigins = getAllowedOrigins(env)
  if (!allowedOrigins.has(origin)) {
    return response
  }

  const headers = new Headers(response.headers)
  headers.set('Access-Control-Allow-Origin', origin)
  headers.set('Vary', 'Origin')
  headers.set('Access-Control-Allow-Credentials', 'true')
  headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  headers.set('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS')
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers })
}

export function preflightResponse(request: Request, env: Env) {
  const origin = request.headers.get('Origin')
  const allowedOrigins = getAllowedOrigins(env)
  const allowOrigin = origin && allowedOrigins.has(origin) ? origin : ''

  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': allowOrigin,
      'Access-Control-Allow-Credentials': 'true',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS',
      Vary: 'Origin',
    },
  })
}

export function buildRefreshCookie(token: string, request: Request, maxAgeSec: number) {
  const secure = new URL(request.url).protocol === 'https:'
  const segments = [
    `refresh_token=${token}`,
    'HttpOnly',
    'SameSite=Lax',
    'Path=/api/auth',
    `Max-Age=${maxAgeSec}`,
  ]
  if (secure) {
    segments.push('Secure')
  }
  return segments.join('; ')
}

export function clearRefreshCookie(request: Request) {
  const secure = new URL(request.url).protocol === 'https:'
  const segments = ['refresh_token=', 'HttpOnly', 'SameSite=Lax', 'Path=/api/auth', 'Max-Age=0']
  if (secure) {
    segments.push('Secure')
  }
  return segments.join('; ')
}
