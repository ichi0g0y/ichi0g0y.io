import type { Env } from './types'
import { errorResponse, jsonResponse, parseCookies, randomToken } from './utils'

const TWITTER_AUTHORIZE_URL = 'https://x.com/i/oauth2/authorize'
const TWITTER_TOKEN_URL = 'https://api.x.com/2/oauth2/token'
const TWITTER_ME_URL = 'https://api.x.com/2/users/me?user.fields=id,name,username'
const OAUTH_STATE_TTL_SEC = 60 * 10
const DEFAULT_TWITTER_SCOPE = 'tweet.read users.read offline.access'

type TwitterTokenResponse = {
  access_token?: string
  refresh_token?: string
  token_type?: string
  scope?: string
  expires_in?: number
}

type TwitterUserResponse = {
  data?: {
    id?: string
    name?: string
    username?: string
  }
}

function getAppOrigin(request: Request, env: Env) {
  if (env.APP_ORIGIN?.trim()) {
    return env.APP_ORIGIN.trim()
  }
  return new URL(request.url).origin
}

function getTwitterCallbackUrl(request: Request, env: Env) {
  return new URL('/api/twitter/auth/callback', getAppOrigin(request, env)).toString()
}

function isSecureRequest(request: Request) {
  return new URL(request.url).protocol === 'https:'
}

function getTwitterClientId(env: Env) {
  return env.TWITTER_CLIENT_ID?.trim() || env.TWITTER_CONSUMER_KEY?.trim() || ''
}

function getTwitterClientSecret(env: Env) {
  return env.TWITTER_CLIENT_SECRET?.trim() || env.TWITTER_CONSUMER_SECRET?.trim() || ''
}

function getTwitterOAuthScope(env: Env) {
  return env.TWITTER_OAUTH_SCOPE?.trim() || DEFAULT_TWITTER_SCOPE
}

function validateTwitterOAuthConfig(env: Env) {
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

function buildTwitterStateCookie(state: string, request: Request) {
  return buildCookie('twitter_oauth_state', state, '/api/twitter/auth', request, OAUTH_STATE_TTL_SEC)
}

function clearTwitterStateCookie(request: Request) {
  return buildCookie('twitter_oauth_state', '', '/api/twitter/auth', request, 0)
}

function buildTwitterCodeVerifierCookie(verifier: string, request: Request) {
  return buildCookie('twitter_oauth_code_verifier', verifier, '/api/twitter/auth', request, OAUTH_STATE_TTL_SEC)
}

function clearTwitterCodeVerifierCookie(request: Request) {
  return buildCookie('twitter_oauth_code_verifier', '', '/api/twitter/auth', request, 0)
}

function redirectResponse(location: string, cookies: string[] = []) {
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

async function createCodeChallenge(codeVerifier: string) {
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

async function exchangeTwitterAuthorizationCode(code: string, codeVerifier: string, request: Request, env: Env) {
  const body = new URLSearchParams()
  body.set('grant_type', 'authorization_code')
  body.set('code', code)
  body.set('redirect_uri', getTwitterCallbackUrl(request, env))
  body.set('code_verifier', codeVerifier)
  return requestTwitterToken(body, env)
}

async function fetchTwitterUser(accessToken: string) {
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

function getPostAuthRedirectUrl(request: Request, env: Env, status?: string, errorCode?: string, hashParams?: URLSearchParams) {
  const url = new URL('/', getAppOrigin(request, env))
  if (status) {
    url.searchParams.set('twitter', status)
  }
  if (errorCode) {
    url.searchParams.set('twitter_error', errorCode)
  }
  const fragment = hashParams && Array.from(hashParams.keys()).length > 0 ? `#${hashParams.toString()}` : ''
  return `${url.toString()}${fragment}`
}

function getClearTwitterCookies(request: Request) {
  return [clearTwitterStateCookie(request), clearTwitterCodeVerifierCookie(request)]
}

export async function handleTwitterOAuthStart(request: Request, env: Env) {
  const configError = validateTwitterOAuthConfig(env)
  if (configError) {
    return errorResponse(configError, 500)
  }

  const clientId = getTwitterClientId(env)
  const state = randomToken(24)
  const codeVerifier = randomToken(48)
  const codeChallenge = await createCodeChallenge(codeVerifier)
  const authorizeUrl = new URL(TWITTER_AUTHORIZE_URL)
  authorizeUrl.searchParams.set('response_type', 'code')
  authorizeUrl.searchParams.set('client_id', clientId)
  authorizeUrl.searchParams.set('redirect_uri', getTwitterCallbackUrl(request, env))
  authorizeUrl.searchParams.set('scope', getTwitterOAuthScope(env))
  authorizeUrl.searchParams.set('state', state)
  authorizeUrl.searchParams.set('code_challenge', codeChallenge)
  authorizeUrl.searchParams.set('code_challenge_method', 'S256')

  const response = jsonResponse({
    ok: true,
    authorizeUrl: authorizeUrl.toString(),
    callbackUrl: getTwitterCallbackUrl(request, env),
    scope: getTwitterOAuthScope(env),
  })
  response.headers.append('Set-Cookie', buildTwitterStateCookie(state, request))
  response.headers.append('Set-Cookie', buildTwitterCodeVerifierCookie(codeVerifier, request))
  return response
}

export async function handleTwitterOAuthCallback(request: Request, env: Env) {
  const configError = validateTwitterOAuthConfig(env)
  if (configError) {
    return redirectResponse(
      getPostAuthRedirectUrl(request, env, undefined, 'twitter_config_error'),
      getClearTwitterCookies(request),
    )
  }

  const url = new URL(request.url)
  const oauthError = url.searchParams.get('error')
  if (oauthError) {
    return redirectResponse(
      getPostAuthRedirectUrl(request, env, undefined, 'twitter_oauth_denied'),
      getClearTwitterCookies(request),
    )
  }

  const state = (url.searchParams.get('state') ?? '').trim()
  const code = (url.searchParams.get('code') ?? '').trim()
  const cookies = parseCookies(request)
  const stateCookie = cookies.get('twitter_oauth_state')
  const codeVerifier = cookies.get('twitter_oauth_code_verifier')
  if (!state || !code || !stateCookie || !codeVerifier || state !== stateCookie) {
    return redirectResponse(
      getPostAuthRedirectUrl(request, env, undefined, 'twitter_state_mismatch'),
      getClearTwitterCookies(request),
    )
  }

  const tokenBody = await exchangeTwitterAuthorizationCode(code, codeVerifier, request, env)
  if (!tokenBody?.access_token) {
    return redirectResponse(
      getPostAuthRedirectUrl(request, env, undefined, 'twitter_token_exchange_failed'),
      getClearTwitterCookies(request),
    )
  }

  const user = await fetchTwitterUser(tokenBody.access_token)
  const hashParams = new URLSearchParams()
  hashParams.set('twitter_access_token', tokenBody.access_token)
  if (tokenBody.refresh_token) {
    hashParams.set('twitter_refresh_token', tokenBody.refresh_token)
  }
  if (tokenBody.token_type) {
    hashParams.set('twitter_token_type', tokenBody.token_type)
  }
  if (tokenBody.scope) {
    hashParams.set('twitter_scope', tokenBody.scope)
  }
  if (typeof tokenBody.expires_in === 'number' && Number.isFinite(tokenBody.expires_in)) {
    hashParams.set('twitter_expires_in', String(tokenBody.expires_in))
  }
  if (user?.id) {
    hashParams.set('twitter_user_id', user.id)
  }
  if (user?.username) {
    hashParams.set('twitter_username', user.username)
  }
  if (user?.name) {
    hashParams.set('twitter_name', user.name)
  }

  return redirectResponse(getPostAuthRedirectUrl(request, env, 'connected', undefined, hashParams), getClearTwitterCookies(request))
}
