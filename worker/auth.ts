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
  sha256Hex,
  verifyAccessToken,
} from './utils'

const ACCESS_TOKEN_TTL_SEC = 60 * 15
const REFRESH_TOKEN_TTL_SEC = 60 * 60 * 24 * 30
const OAUTH_STATE_TTL_SEC = 60 * 10

type GitHubAccessTokenResponse = {
  access_token?: string
}

type GitHubUserResponse = {
  login?: string
  email?: string | null
}

type GitHubEmailResponse = {
  email?: string
  primary?: boolean
  verified?: boolean
}

function normalizeLogin(raw: string) {
  return raw.trim().toLowerCase()
}

function isAllowedGitHubLogin(login: string, env: Env) {
  const allowed = env.ALLOWED_GITHUB_LOGINS.split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean)
  return allowed.includes(login)
}

function getAppOrigin(request: Request, env: Env) {
  if (env.APP_ORIGIN?.trim()) {
    return env.APP_ORIGIN.trim()
  }
  return new URL(request.url).origin
}

function getGitHubCallbackUrl(request: Request, env: Env) {
  return new URL('/api/auth/github/callback', getAppOrigin(request, env)).toString()
}

function getPostAuthRedirectUrl(request: Request, env: Env, authError?: string) {
  const url = new URL('/', getAppOrigin(request, env))
  if (authError) {
    url.searchParams.set('auth_error', authError)
  }
  return url.toString()
}

function isSecureRequest(request: Request) {
  return new URL(request.url).protocol === 'https:'
}

function buildGitHubStateCookie(state: string, request: Request, maxAgeSec: number) {
  const segments = [
    `github_oauth_state=${state}`,
    'HttpOnly',
    'SameSite=Lax',
    'Path=/api/auth/github',
    `Max-Age=${maxAgeSec}`,
  ]
  if (isSecureRequest(request)) {
    segments.push('Secure')
  }
  return segments.join('; ')
}

function clearGitHubStateCookie(request: Request) {
  const segments = ['github_oauth_state=', 'HttpOnly', 'SameSite=Lax', 'Path=/api/auth/github', 'Max-Age=0']
  if (isSecureRequest(request)) {
    segments.push('Secure')
  }
  return segments.join('; ')
}

function validateGitHubOAuthConfig(env: Env) {
  if (!env.ACCESS_TOKEN_SECRET) {
    return 'ACCESS_TOKEN_SECRET が未設定です'
  }
  if (!env.GITHUB_CLIENT_ID) {
    return 'GITHUB_CLIENT_ID が未設定です'
  }
  if (!env.GITHUB_CLIENT_SECRET) {
    return 'GITHUB_CLIENT_SECRET が未設定です'
  }
  if (!env.ALLOWED_GITHUB_LOGINS) {
    return 'ALLOWED_GITHUB_LOGINS が未設定です'
  }
  return null
}

function buildGitHubApiHeaders(accessToken: string) {
  return {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${accessToken}`,
    'User-Agent': 'ichi0g0y-portfolio-worker',
    'X-GitHub-Api-Version': '2022-11-28',
  }
}

function redirectResponse(location: string, cookies: string[] = []) {
  const headers = new Headers({ Location: location })
  for (const cookie of cookies) {
    headers.append('Set-Cookie', cookie)
  }
  return new Response(null, { status: 302, headers })
}

async function createRefreshHash(token: string, env: Env) {
  return sha256Hex(`${token}:${env.ACCESS_TOKEN_SECRET}`)
}

async function issueAuthSession(identity: string, request: Request, env: Env) {
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
    .bind(sessionId, identity, refreshHash, refreshExpiresAt, now)
    .run()

  const accessToken = await createAccessToken(
    { sid: sessionId, email: identity, iat: now, exp: now + ACCESS_TOKEN_TTL_SEC },
    env.ACCESS_TOKEN_SECRET,
  )

  return {
    accessToken,
    refreshCookie: buildRefreshCookie(refreshToken, request, REFRESH_TOKEN_TTL_SEC),
    email: identity,
    expiresAt: now + ACCESS_TOKEN_TTL_SEC,
  }
}

async function fetchGitHubAccessToken(code: string, request: Request, env: Env) {
  const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      client_id: env.GITHUB_CLIENT_ID,
      client_secret: env.GITHUB_CLIENT_SECRET,
      code,
      redirect_uri: getGitHubCallbackUrl(request, env),
    }),
  })

  if (!tokenResponse.ok) {
    return null
  }

  const tokenData = (await tokenResponse.json().catch(() => null)) as GitHubAccessTokenResponse | null
  return tokenData?.access_token ?? null
}

async function fetchGitHubUser(accessToken: string) {
  const userResponse = await fetch('https://api.github.com/user', {
    headers: buildGitHubApiHeaders(accessToken),
  })
  if (!userResponse.ok) {
    return null
  }

  const user = (await userResponse.json().catch(() => null)) as GitHubUserResponse | null
  const login = normalizeLogin(user?.login ?? '')
  if (!login) {
    return null
  }

  let email = user?.email ?? null
  if (!email) {
    const emailsResponse = await fetch('https://api.github.com/user/emails', {
      headers: buildGitHubApiHeaders(accessToken),
    })
    if (!emailsResponse.ok) {
      return { login, email: null }
    }

    const emails = (await emailsResponse.json().catch(() => null)) as GitHubEmailResponse[] | null
    const verifiedPrimary = emails?.find((item) => item.verified && item.primary)
    const verifiedAny = emails?.find((item) => item.verified)
    email = verifiedPrimary?.email ?? verifiedAny?.email ?? null
  }

  return {
    login,
    email: email ? email.trim().toLowerCase() : null,
  }
}

export async function handleGitHubOAuthStart(request: Request, env: Env) {
  const configError = validateGitHubOAuthConfig(env)
  if (configError) {
    return errorResponse(configError, 500)
  }

  const state = randomToken(24)
  const authorizeUrl = new URL('https://github.com/login/oauth/authorize')
  authorizeUrl.searchParams.set('client_id', env.GITHUB_CLIENT_ID)
  authorizeUrl.searchParams.set('redirect_uri', getGitHubCallbackUrl(request, env))
  authorizeUrl.searchParams.set('scope', 'read:user user:email')
  authorizeUrl.searchParams.set('state', state)

  return redirectResponse(authorizeUrl.toString(), [buildGitHubStateCookie(state, request, OAUTH_STATE_TTL_SEC)])
}

export async function handleGitHubOAuthCallback(request: Request, env: Env) {
  const configError = validateGitHubOAuthConfig(env)
  if (configError) {
    return errorResponse(configError, 500)
  }

  const url = new URL(request.url)
  const authError = url.searchParams.get('error')
  if (authError) {
    return redirectResponse(getPostAuthRedirectUrl(request, env, 'oauth_denied'), [clearGitHubStateCookie(request)])
  }

  const state = (url.searchParams.get('state') ?? '').trim()
  const code = (url.searchParams.get('code') ?? '').trim()
  const stateCookie = parseCookies(request).get('github_oauth_state')
  if (!state || !code || !stateCookie || state !== stateCookie) {
    return redirectResponse(getPostAuthRedirectUrl(request, env, 'state_mismatch'), [clearGitHubStateCookie(request)])
  }

  const accessToken = await fetchGitHubAccessToken(code, request, env)
  if (!accessToken) {
    return redirectResponse(getPostAuthRedirectUrl(request, env, 'token_exchange_failed'), [
      clearGitHubStateCookie(request),
    ])
  }

  const user = await fetchGitHubUser(accessToken)
  if (!user) {
    return redirectResponse(getPostAuthRedirectUrl(request, env, 'github_user_failed'), [clearGitHubStateCookie(request)])
  }

  if (!isAllowedGitHubLogin(user.login, env)) {
    return redirectResponse(getPostAuthRedirectUrl(request, env, 'forbidden_user'), [clearGitHubStateCookie(request)])
  }

  const identity = user.email ?? `github:${user.login}`
  const session = await issueAuthSession(identity, request, env)
  return redirectResponse(getPostAuthRedirectUrl(request, env), [session.refreshCookie, clearGitHubStateCookie(request)])
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

  const nextRefreshExpiresAt = now + REFRESH_TOKEN_TTL_SEC

  // リフレッシュトークンローテーションは意図的に無効化。
  // 開発環境（React StrictMode）やマルチタブ利用時に、同時リフレッシュリクエストが
  // 互いのトークンを無効化し、断続的なログアウトを引き起こすのを防止するため。
  await env.DB.prepare(
    `
      UPDATE auth_sessions
      SET expires_at = ?1
      WHERE id = ?2
    `,
  )
    .bind(nextRefreshExpiresAt, session.id)
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
  response.headers.set('Set-Cookie', buildRefreshCookie(refreshToken, request, REFRESH_TOKEN_TTL_SEC))
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
  response.headers.append('Set-Cookie', clearRefreshCookie(request))
  response.headers.append('Set-Cookie', clearGitHubStateCookie(request))
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
