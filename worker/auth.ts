import type { AuthContext, Env } from './types'
import {
  buildRefreshCookie,
  clearRefreshCookie,
  createAccessToken,
  errorResponse,
  jsonResponse,
  nowSeconds,
  parseCookies,
  randomToken,
  readBearerToken,
  readJsonBody,
  sha256Hex,
  verifyAccessToken,
} from './utils'

const ACCESS_TOKEN_TTL_SEC = 60 * 15
const REFRESH_TOKEN_TTL_SEC = 60 * 60 * 24 * 30
const AUTH_CODE_TTL_SEC = 60 * 10

function normalizeEmail(raw: string) {
  return raw.trim().toLowerCase()
}

function isAllowedEmail(email: string, env: Env) {
  const allowed = env.ALLOWED_EMAILS.split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean)
  return allowed.includes(email)
}

function createCode() {
  return String(Math.floor(Math.random() * 1_000_000)).padStart(6, '0')
}

async function createCodeHash(email: string, code: string, env: Env) {
  return sha256Hex(`${email}:${code}:${env.ACCESS_TOKEN_SECRET}`)
}

async function createRefreshHash(token: string, env: Env) {
  return sha256Hex(`${token}:${env.ACCESS_TOKEN_SECRET}`)
}

async function issueAuthSession(email: string, request: Request, env: Env) {
  const now = nowSeconds()
  const sessionId = randomToken(24)
  const refreshToken = randomToken(32)
  const refreshHash = await createRefreshHash(refreshToken, env)
  const refreshExpiresAt = now + REFRESH_TOKEN_TTL_SEC

  await env.DB.prepare(
    `
      INSERT INTO auth_sessions (id, email, refresh_hash, expires_at, created_at, revoked_at)
      VALUES (?1, ?2, ?3, ?4, ?5, NULL)
    `,
  )
    .bind(sessionId, email, refreshHash, refreshExpiresAt, now)
    .run()

  const accessToken = await createAccessToken(
    { sid: sessionId, email, iat: now, exp: now + ACCESS_TOKEN_TTL_SEC },
    env.ACCESS_TOKEN_SECRET,
  )

  return {
    accessToken,
    refreshCookie: buildRefreshCookie(refreshToken, request, REFRESH_TOKEN_TTL_SEC),
    email,
    expiresAt: now + ACCESS_TOKEN_TTL_SEC,
  }
}

export async function handleRequestCode(request: Request, env: Env) {
  if (!env.ACCESS_TOKEN_SECRET) {
    return errorResponse('ACCESS_TOKEN_SECRET が未設定です', 500)
  }

  const body = await readJsonBody<{ email?: string }>(request)
  const email = normalizeEmail(body?.email ?? '')
  if (!email || !email.includes('@')) {
    return errorResponse('メールアドレスを入力してください', 400)
  }

  if (!isAllowedEmail(email, env)) {
    return errorResponse('このメールアドレスは許可されていません', 403)
  }

  const code = createCode()
  const codeHash = await createCodeHash(email, code, env)
  const now = nowSeconds()

  await env.DB.batch([
    env.DB.prepare('DELETE FROM login_codes WHERE email = ?1').bind(email),
    env.DB.prepare(
      `
        INSERT INTO login_codes (email, code_hash, expires_at, created_at)
        VALUES (?1, ?2, ?3, ?4)
      `,
    ).bind(email, codeHash, now + AUTH_CODE_TTL_SEC, now),
  ])

  console.log(`[auth-code] ${email}: ${code}`)

  return jsonResponse({
    ok: true,
    message: '認証コードを発行しました',
    devCode: env.SHOW_DEV_AUTH_CODE === '1' ? code : undefined,
  })
}

export async function handleVerifyCode(request: Request, env: Env) {
  if (!env.ACCESS_TOKEN_SECRET) {
    return errorResponse('ACCESS_TOKEN_SECRET が未設定です', 500)
  }

  const body = await readJsonBody<{ email?: string; code?: string }>(request)
  const email = normalizeEmail(body?.email ?? '')
  const code = (body?.code ?? '').trim()

  if (!email || !code) {
    return errorResponse('メールアドレスと認証コードを入力してください', 400)
  }

  const row = await env.DB.prepare(
    `
      SELECT id, code_hash, expires_at
      FROM login_codes
      WHERE email = ?1
      ORDER BY id DESC
      LIMIT 1
    `,
  )
    .bind(email)
    .first<{ id: number; code_hash: string; expires_at: number }>()

  if (!row) {
    return errorResponse('認証コードが見つかりません', 401)
  }

  if (row.expires_at <= nowSeconds()) {
    await env.DB.prepare('DELETE FROM login_codes WHERE email = ?1').bind(email).run()
    return errorResponse('認証コードの有効期限が切れています', 401)
  }

  const expectedHash = await createCodeHash(email, code, env)
  if (expectedHash !== row.code_hash) {
    return errorResponse('認証コードが一致しません', 401)
  }

  await env.DB.prepare('DELETE FROM login_codes WHERE email = ?1').bind(email).run()

  const session = await issueAuthSession(email, request, env)
  const response = jsonResponse({
    ok: true,
    accessToken: session.accessToken,
    email: session.email,
    expiresAt: session.expiresAt,
  })
  response.headers.set('Set-Cookie', session.refreshCookie)
  return response
}

export async function handleRefresh(request: Request, env: Env) {
  if (!env.ACCESS_TOKEN_SECRET) {
    return errorResponse('ACCESS_TOKEN_SECRET が未設定です', 500)
  }

  const refreshToken = parseCookies(request).get('refresh_token')
  if (!refreshToken) {
    return errorResponse('refresh token がありません', 401)
  }

  const refreshHash = await createRefreshHash(refreshToken, env)
  const now = nowSeconds()
  const session = await env.DB.prepare(
    `
      SELECT id, email, expires_at, revoked_at
      FROM auth_sessions
      WHERE refresh_hash = ?1
      LIMIT 1
    `,
  )
    .bind(refreshHash)
    .first<{ id: string; email: string; expires_at: number; revoked_at: number | null }>()

  if (!session || session.revoked_at !== null || session.expires_at <= now) {
    return errorResponse('refresh token が無効です', 401)
  }

  const nextRefreshToken = randomToken(32)
  const nextRefreshHash = await createRefreshHash(nextRefreshToken, env)
  const nextRefreshExpiresAt = now + REFRESH_TOKEN_TTL_SEC

  await env.DB.prepare(
    `
      UPDATE auth_sessions
      SET refresh_hash = ?1, expires_at = ?2
      WHERE id = ?3
    `,
  )
    .bind(nextRefreshHash, nextRefreshExpiresAt, session.id)
    .run()

  const accessToken = await createAccessToken(
    { sid: session.id, email: session.email, iat: now, exp: now + ACCESS_TOKEN_TTL_SEC },
    env.ACCESS_TOKEN_SECRET,
  )

  const response = jsonResponse({
    ok: true,
    accessToken,
    email: session.email,
    expiresAt: now + ACCESS_TOKEN_TTL_SEC,
  })
  response.headers.set('Set-Cookie', buildRefreshCookie(nextRefreshToken, request, REFRESH_TOKEN_TTL_SEC))
  return response
}

export async function handleLogout(request: Request, env: Env) {
  if (!env.ACCESS_TOKEN_SECRET) {
    return errorResponse('ACCESS_TOKEN_SECRET が未設定です', 500)
  }

  const refreshToken = parseCookies(request).get('refresh_token')
  if (refreshToken) {
    const refreshHash = await createRefreshHash(refreshToken, env)
    await env.DB.prepare('UPDATE auth_sessions SET revoked_at = ?1 WHERE refresh_hash = ?2')
      .bind(nowSeconds(), refreshHash)
      .run()
  }

  const response = jsonResponse({ ok: true })
  response.headers.set('Set-Cookie', clearRefreshCookie(request))
  return response
}

export async function requireAuth(request: Request, env: Env): Promise<AuthContext | null> {
  if (!env.ACCESS_TOKEN_SECRET) {
    return null
  }

  const token = readBearerToken(request)
  if (!token) {
    return null
  }

  const payload = await verifyAccessToken(token, env.ACCESS_TOKEN_SECRET)
  if (!payload) {
    return null
  }

  const session = await env.DB.prepare(
    `
      SELECT id, email, expires_at, revoked_at
      FROM auth_sessions
      WHERE id = ?1
      LIMIT 1
    `,
  )
    .bind(payload.sid)
    .first<{ id: string; email: string; expires_at: number; revoked_at: number | null }>()

  if (!session || session.revoked_at !== null || session.expires_at <= nowSeconds()) {
    return null
  }

  return { sessionId: session.id, email: session.email }
}
