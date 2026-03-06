// Twitter OAuth認証フローとトークン管理

import type { Env } from './types'
import { nowSeconds, parseCookies, randomToken } from './utils'
import type { TwitterConnection, TwitterTokenResponse, TwitterUser, TwitterUserResponse } from './twitter-types'
import {
  TWITTER_AUTHORIZE_URL,
  TWITTER_TOKEN_URL,
  TWITTER_ME_URL,
  OAUTH_STATE_TTL_SEC,
  ACCESS_TOKEN_REFRESH_MARGIN_SEC,
  DEFAULT_TWITTER_SCOPE,
} from './twitter-types'
import { getStoredTwitterConnection, upsertTwitterConnection } from './twitter-db'

function getAppOrigin(request: Request, env: Env) {
  if (env.APP_ORIGIN?.trim()) {
    return env.APP_ORIGIN.trim()
  }
  return new URL(request.url).origin
}

export function getTwitterCallbackUrl(request: Request, env: Env) {
  return new URL('/api/twitter/auth/callback', getAppOrigin(request, env)).toString()
}

function isSecureRequest(request: Request) {
  return new URL(request.url).protocol === 'https:'
}

export function getTwitterClientId(env: Env) {
  return env.TWITTER_CLIENT_ID?.trim() || env.TWITTER_CONSUMER_KEY?.trim() || ''
}

function getTwitterClientSecret(env: Env) {
  return env.TWITTER_CLIENT_SECRET?.trim() || env.TWITTER_CONSUMER_SECRET?.trim() || ''
}

export function getTwitterOAuthScope(env: Env) {
  return env.TWITTER_OAUTH_SCOPE?.trim() || DEFAULT_TWITTER_SCOPE
}

export function hasTwitterScope(scope: string | null | undefined, expected: string) {
  return (scope ?? '')
    .split(/\s+/)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
    .includes(expected)
}

export function hasTwitterWriteScope(scope: string | null | undefined) {
  return hasTwitterScope(scope, 'tweet.write')
}

export function hasTwitterMediaWriteScope(scope: string | null | undefined) {
  return hasTwitterScope(scope, 'media.write')
}

export function validateTwitterOAuthConfig(env: Env) {
  if (!getTwitterClientId(env)) {
    return 'TWITTER_CLIENT_ID または TWITTER_CONSUMER_KEY が未設定です'
  }
  return null
}

function buildCookie(name: string, value: string, path: string, request: Request, maxAgeSec: number) {
  const segments = [name ? `${name}=${value}` : value, 'HttpOnly', 'SameSite=Lax', `Path=${path}`, `Max-Age=${maxAgeSec}`]
  if (isSecureRequest(request)) {
    segments.push('Secure')
  }
  return segments.join('; ')
}

export function buildTwitterStateCookie(state: string, request: Request) {
  return buildCookie('twitter_oauth_state', state, '/api/twitter/auth', request, OAUTH_STATE_TTL_SEC)
}

function clearTwitterStateCookie(request: Request) {
  return buildCookie('twitter_oauth_state', '', '/api/twitter/auth', request, 0)
}

export function buildTwitterCodeVerifierCookie(verifier: string, request: Request) {
  return buildCookie('twitter_oauth_code_verifier', verifier, '/api/twitter/auth', request, OAUTH_STATE_TTL_SEC)
}

function clearTwitterCodeVerifierCookie(request: Request) {
  return buildCookie('twitter_oauth_code_verifier', '', '/api/twitter/auth', request, 0)
}

export function redirectResponse(location: string, cookies: string[] = []) {
  const headers = new Headers({ Location: location })
  for (const cookie of cookies) {
    headers.append('Set-Cookie', cookie)
  }
  return new Response(null, { status: 302, headers })
}

function toBase64Url(bytes: Uint8Array) {
  let binary = ''
  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index])
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

export async function createCodeChallenge(codeVerifier: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(codeVerifier))
  return toBase64Url(new Uint8Array(digest))
}

async function requestTwitterToken(body: URLSearchParams, env: Env) {
  const clientId = getTwitterClientId(env)
  const clientSecret = getTwitterClientSecret(env)
  const attempts = clientSecret
    ? [
        { includeClientId: false, includeBasicAuth: true },
        { includeClientId: true, includeBasicAuth: false },
      ]
    : [{ includeClientId: true, includeBasicAuth: false }]

  for (const attempt of attempts) {
    const requestBody = new URLSearchParams(body)
    if (attempt.includeClientId) {
      requestBody.set('client_id', clientId)
    }

    const headers = new Headers({
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    })

    if (attempt.includeBasicAuth) {
      headers.set('Authorization', `Basic ${btoa(`${clientId}:${clientSecret}`)}`)
    }

    const response = await fetch(TWITTER_TOKEN_URL, {
      method: 'POST',
      headers,
      body: requestBody.toString(),
    })
    if (!response.ok) {
      continue
    }

    const tokenBody = (await response.json().catch(() => null)) as TwitterTokenResponse | null
    if (tokenBody?.access_token) {
      return tokenBody
    }
  }

  return null
}

export async function exchangeTwitterAuthorizationCode(code: string, codeVerifier: string, request: Request, env: Env) {
  const body = new URLSearchParams()
  body.set('grant_type', 'authorization_code')
  body.set('code', code)
  body.set('redirect_uri', getTwitterCallbackUrl(request, env))
  body.set('code_verifier', codeVerifier)
  return requestTwitterToken(body, env)
}

export async function refreshTwitterAuthorization(connection: TwitterConnection, env: Env) {
  if (!connection.refreshToken) {
    return null
  }

  const body = new URLSearchParams()
  body.set('grant_type', 'refresh_token')
  body.set('refresh_token', connection.refreshToken)
  return requestTwitterToken(body, env)
}

export async function fetchTwitterUser(accessToken: string) {
  const response = await fetch(TWITTER_ME_URL, {
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
  })
  if (!response.ok) {
    return null
  }
  const user = (await response.json().catch(() => null)) as TwitterUserResponse | null
  return user?.data ?? null
}

export function getPostAuthRedirectUrl(request: Request, env: Env, status?: string, errorCode?: string) {
  const url = new URL('/', getAppOrigin(request, env))
  if (status) {
    url.searchParams.set('twitter', status)
  }
  if (errorCode) {
    url.searchParams.set('twitter_error', errorCode)
  }
  return url.toString()
}

export function getClearTwitterCookies(request: Request) {
  return [clearTwitterStateCookie(request), clearTwitterCodeVerifierCookie(request)]
}

export async function ensureTwitterConnectionReady(env: Env) {
  const connection = await getStoredTwitterConnection(env)
  if (!connection) {
    return null
  }

  if (!connection.accessExpiresAt || connection.accessExpiresAt > nowSeconds() + ACCESS_TOKEN_REFRESH_MARGIN_SEC) {
    return connection
  }

  const refreshedTokenBody = await refreshTwitterAuthorization(connection, env)
  if (!refreshedTokenBody) {
    return null
  }

  const refreshedConnection = await upsertTwitterConnection(env, refreshedTokenBody, null, connection)
  return refreshedConnection ?? null
}
