import { renderWithingsChartPng } from './withings-chart'
import type { Env } from './types'
import { errorResponse, jsonResponse, nowSeconds, parseCookies, randomToken, readJsonBody } from './utils'

const TWITTER_AUTHORIZE_URL = 'https://x.com/i/oauth2/authorize'
const TWITTER_TOKEN_URL = 'https://api.x.com/2/oauth2/token'
const TWITTER_ME_URL = 'https://api.x.com/2/users/me?user.fields=id,name,username'
const TWITTER_CREATE_TWEET_URL = 'https://api.x.com/2/tweets'
const TWITTER_MEDIA_UPLOAD_INITIALIZE_URL = 'https://api.x.com/2/media/upload/initialize'
const OAUTH_STATE_TTL_SEC = 60 * 10
const ACCESS_TOKEN_REFRESH_MARGIN_SEC = 60 * 5
const DEFAULT_TWITTER_SCOPE = 'tweet.read tweet.write users.read offline.access media.write'
const DEFAULT_TWITTER_POST_TEMPLATE = '体重 {{weight}}kg / 体脂肪率 {{fat_ratio}}% / BMI {{bmi}}\n{{measured_at}}'
const TWITTER_TEMPLATE_MAX_LENGTH = 1000
const TWITTER_POST_MAX_LENGTH = 280
const JST_TIME_ZONE = 'Asia/Tokyo'

type TwitterTokenResponse = {
  access_token?: string
  refresh_token?: string
  token_type?: string
  scope?: string
  expires_in?: number
}

type TwitterUser = {
  id?: string
  name?: string
  username?: string
}

type TwitterUserResponse = {
  data?: TwitterUser
}

type TwitterConnectionRow = {
  user_id: string
  username: string | null
  name: string | null
  access_token: string
  refresh_token: string | null
  token_type: string | null
  scope: string | null
  access_expires_at: number | null
  created_at: number
  updated_at: number
}

type TwitterPostSettingsRow = {
  auto_post_enabled: number
  template_text: string
  last_posted_grpid: number | null
  last_posted_measured_at: number | null
  last_posted_tweet_id: string | null
  last_posted_tweet_at: number | null
  created_at: number
  updated_at: number
}

type TwitterConnection = {
  userId: string
  username: string | null
  name: string | null
  accessToken: string
  refreshToken: string | null
  tokenType: string | null
  scope: string | null
  accessExpiresAt: number | null
  createdAt: number
  updatedAt: number
}

type TwitterPostSettings = {
  autoPostEnabled: boolean
  template: string
  lastPostedGroupId: number | null
  lastPostedMeasuredAt: number | null
  lastPostedTweetId: string | null
  lastPostedTweetAt: number | null
  createdAt: number
  updatedAt: number
}

type TwitterStatusResponse = {
  ok: true
  connected: boolean
  connection: {
    userId: string
    username: string | null
    name: string | null
    scope: string | null
    accessExpiresAt: number | null
    updatedAt: number
  } | null
  settings: {
    autoPostEnabled: boolean
    template: string
    lastPostedGroupId: number | null
    lastPostedMeasuredAt: number | null
    lastPostedTweetId: string | null
    lastPostedTweetAt: number | null
  }
}

type WithingsMeasurementForTweet = {
  grpid: number
  measuredAt: number
  weightKg: number | null
  fatRatio: number | null
  bmi: number | null
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

function hasTwitterScope(scope: string | null | undefined, expected: string) {
  return (scope ?? '')
    .split(/\s+/)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
    .includes(expected)
}

function hasTwitterWriteScope(scope: string | null | undefined) {
  return hasTwitterScope(scope, 'tweet.write')
}

function hasTwitterMediaWriteScope(scope: string | null | undefined) {
  return hasTwitterScope(scope, 'media.write')
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

async function refreshTwitterAuthorization(connection: TwitterConnection, env: Env) {
  if (!connection.refreshToken) {
    return null
  }

  const body = new URLSearchParams()
  body.set('grant_type', 'refresh_token')
  body.set('refresh_token', connection.refreshToken)
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

function getPostAuthRedirectUrl(request: Request, env: Env, status?: string, errorCode?: string) {
  const url = new URL('/', getAppOrigin(request, env))
  if (status) {
    url.searchParams.set('twitter', status)
  }
  if (errorCode) {
    url.searchParams.set('twitter_error', errorCode)
  }
  return url.toString()
}

function getClearTwitterCookies(request: Request) {
  return [clearTwitterStateCookie(request), clearTwitterCodeVerifierCookie(request)]
}

function toConnection(row: TwitterConnectionRow): TwitterConnection {
  return {
    userId: row.user_id,
    username: row.username,
    name: row.name,
    accessToken: row.access_token,
    refreshToken: row.refresh_token,
    tokenType: row.token_type,
    scope: row.scope,
    accessExpiresAt: row.access_expires_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function toSettings(row: TwitterPostSettingsRow): TwitterPostSettings {
  return {
    autoPostEnabled: row.auto_post_enabled === 1,
    template: row.template_text,
    lastPostedGroupId: row.last_posted_grpid,
    lastPostedMeasuredAt: row.last_posted_measured_at,
    lastPostedTweetId: row.last_posted_tweet_id,
    lastPostedTweetAt: row.last_posted_tweet_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function parseNullableFiniteNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function getDefaultTwitterPostTemplate() {
  return DEFAULT_TWITTER_POST_TEMPLATE
}

async function getStoredTwitterConnection(env: Env) {
  const row = await env.DB.prepare(
    `
      SELECT user_id, username, name, access_token, refresh_token, token_type, scope,
             access_expires_at, created_at, updated_at
      FROM twitter_connections
      WHERE id = 1
      LIMIT 1
    `,
  ).first<TwitterConnectionRow>()

  return row ? toConnection(row) : null
}

async function ensureTwitterPostSettings(env: Env) {
  const existing = await env.DB.prepare(
    `
      SELECT auto_post_enabled, template_text, last_posted_grpid, last_posted_measured_at, last_posted_tweet_id,
             last_posted_tweet_at, created_at, updated_at
      FROM twitter_post_settings
      WHERE id = 1
      LIMIT 1
    `,
  ).first<TwitterPostSettingsRow>()

  if (existing) {
    return toSettings(existing)
  }

  const now = nowSeconds()
  const template = getDefaultTwitterPostTemplate()
  await env.DB.prepare(
    `
      INSERT INTO twitter_post_settings (
        id, auto_post_enabled, template_text, last_posted_grpid, last_posted_measured_at,
        last_posted_tweet_id, last_posted_tweet_at, created_at, updated_at
      )
      VALUES (?1, ?2, ?3, NULL, NULL, NULL, NULL, ?4, ?4)
    `,
  )
    .bind(1, 1, template, now)
    .run()

  return {
    autoPostEnabled: true,
    template,
    lastPostedGroupId: null,
    lastPostedMeasuredAt: null,
    lastPostedTweetId: null,
    lastPostedTweetAt: null,
    createdAt: now,
    updatedAt: now,
  } satisfies TwitterPostSettings
}

async function upsertTwitterConnection(
  env: Env,
  tokenBody: TwitterTokenResponse,
  user: TwitterUser | null,
  previousConnection: TwitterConnection | null,
) {
  const accessToken = tokenBody.access_token?.trim() ?? ''
  const userId = user?.id?.trim() || previousConnection?.userId || ''
  if (!accessToken || !userId) {
    return null
  }

  const username = user?.username?.trim() || previousConnection?.username || null
  const name = user?.name?.trim() || previousConnection?.name || null
  const refreshToken = tokenBody.refresh_token?.trim() || previousConnection?.refreshToken || null
  const tokenType = tokenBody.token_type?.trim() || previousConnection?.tokenType || null
  const scope = tokenBody.scope?.trim() || previousConnection?.scope || null
  const expiresIn = parseNullableFiniteNumber(tokenBody.expires_in)
  const now = nowSeconds()
  const accessExpiresAt =
    typeof expiresIn === 'number' && expiresIn > 0
      ? now + Math.floor(expiresIn)
      : previousConnection?.accessExpiresAt ?? null

  await env.DB.prepare(
    `
      INSERT INTO twitter_connections (
        id, user_id, username, name, access_token, refresh_token, token_type, scope,
        access_expires_at, created_at, updated_at
      )
      VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?10)
      ON CONFLICT(id) DO UPDATE SET
        user_id = excluded.user_id,
        username = excluded.username,
        name = excluded.name,
        access_token = excluded.access_token,
        refresh_token = excluded.refresh_token,
        token_type = excluded.token_type,
        scope = excluded.scope,
        access_expires_at = excluded.access_expires_at,
        updated_at = excluded.updated_at
    `,
  )
    .bind(1, userId, username, name, accessToken, refreshToken, tokenType, scope, accessExpiresAt, now)
    .run()

  return {
    userId,
    username,
    name,
    accessToken,
    refreshToken,
    tokenType,
    scope,
    accessExpiresAt,
    createdAt: previousConnection?.createdAt ?? now,
    updatedAt: now,
  } satisfies TwitterConnection
}

async function ensureTwitterConnectionReady(env: Env) {
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

function encodeBase64(bytes: Uint8Array) {
  let binary = ''
  const chunkSize = 0x8000
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    const chunk = bytes.subarray(offset, offset + chunkSize)
    binary += String.fromCharCode(...chunk)
  }
  return btoa(binary)
}

async function uploadTwitterImage(accessToken: string, png: Uint8Array) {
  const initializeResponse = await fetch(TWITTER_MEDIA_UPLOAD_INITIALIZE_URL, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      media_type: 'image/png',
      media_category: 'tweet_image',
      shared: false,
      total_bytes: png.byteLength,
    }),
  })

  const initializePayload = (await initializeResponse.json().catch(() => null)) as
    | {
        data?: { id?: string }
        media_id_string?: string
        media_id?: string | number
        errors?: Array<{ detail?: string; title?: string }>
        detail?: string
        title?: string
      }
    | null
  const mediaId =
    initializePayload?.data?.id?.trim() ||
    (typeof initializePayload?.media_id_string === 'string' ? initializePayload.media_id_string.trim() : '') ||
    (initializePayload?.media_id ? String(initializePayload.media_id) : null)

  const errorDetail =
    initializePayload?.errors?.map((error) => error.detail || error.title).filter(Boolean).join(' / ') ||
    initializePayload?.detail ||
    initializePayload?.title ||
    null

  if (!initializeResponse.ok || !mediaId) {
    return {
      ok: false,
      status: initializeResponse.status,
      mediaId: null,
      errorDetail,
    }
  }

  const appendResponse = await fetch(`https://api.x.com/2/media/upload/${mediaId}/append`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      media: encodeBase64(png),
      segment_index: 0,
    }),
  })

  const appendPayload = (await appendResponse.json().catch(() => null)) as
    | {
        errors?: Array<{ detail?: string; title?: string }>
        detail?: string
        title?: string
      }
    | null
  const appendErrorDetail =
    appendPayload?.errors?.map((error) => error.detail || error.title).filter(Boolean).join(' / ') ||
    appendPayload?.detail ||
    appendPayload?.title ||
    null

  if (!appendResponse.ok) {
    return {
      ok: false,
      status: appendResponse.status,
      mediaId: null,
      errorDetail: appendErrorDetail,
    }
  }

  const finalizeResponse = await fetch(`https://api.x.com/2/media/upload/${mediaId}/finalize`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
  })

  const finalizePayload = (await finalizeResponse.json().catch(() => null)) as
    | {
        data?: {
          id?: string
          processing_info?: { state?: string }
        }
        errors?: Array<{ detail?: string; title?: string }>
        detail?: string
        title?: string
      }
    | null
  const finalizeErrorDetail =
    finalizePayload?.errors?.map((error) => error.detail || error.title).filter(Boolean).join(' / ') ||
    finalizePayload?.detail ||
    finalizePayload?.title ||
    null
  const processingState = finalizePayload?.data?.processing_info?.state?.trim().toLowerCase() || null

  return {
    ok:
      finalizeResponse.ok &&
      (processingState === null || processingState === 'succeeded' || processingState === 'pending' || processingState === 'in_progress'),
    status: finalizeResponse.status,
    mediaId,
    errorDetail: finalizeErrorDetail,
  }
}

async function uploadTwitterImageWithRefresh(env: Env, png: Uint8Array) {
  let connection = await ensureTwitterConnectionReady(env)
  if (!connection) {
    return { ok: false, mediaId: null as string | null }
  }

  let result = await uploadTwitterImage(connection.accessToken, png)
  if (result.status === 401) {
    const refreshedTokenBody = await refreshTwitterAuthorization(connection, env)
    if (!refreshedTokenBody) {
      return { ok: false, mediaId: null as string | null }
    }
    const refreshedConnection = await upsertTwitterConnection(env, refreshedTokenBody, null, connection)
    if (!refreshedConnection) {
      return { ok: false, mediaId: null as string | null }
    }
    connection = refreshedConnection
    result = await uploadTwitterImage(connection.accessToken, png)
  }

  return {
    ok: result.ok && Boolean(result.mediaId),
    mediaId: result.mediaId,
    errorDetail: result.errorDetail,
  }
}

async function createTweet(accessToken: string, text: string, mediaId?: string | null) {
  const response = await fetch(TWITTER_CREATE_TWEET_URL, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(mediaId ? { text, media: { media_ids: [mediaId] } } : { text }),
  })

  const payload = (await response.json().catch(() => null)) as { data?: { id?: string } } | null
  return {
    ok: response.ok,
    status: response.status,
    tweetId: payload?.data?.id?.trim() || null,
  }
}

async function createTweetWithRefresh(env: Env, text: string, mediaId?: string | null) {
  let connection = await ensureTwitterConnectionReady(env)
  if (!connection) {
    return { ok: false, tweetId: null as string | null }
  }

  let result = await createTweet(connection.accessToken, text, mediaId)
  if (result.status === 401) {
    const refreshedTokenBody = await refreshTwitterAuthorization(connection, env)
    if (!refreshedTokenBody) {
      return { ok: false, tweetId: null as string | null }
    }
    const refreshedConnection = await upsertTwitterConnection(env, refreshedTokenBody, null, connection)
    if (!refreshedConnection) {
      return { ok: false, tweetId: null as string | null }
    }
    connection = refreshedConnection
    result = await createTweet(connection.accessToken, text, mediaId)
  }

  return {
    ok: result.ok,
    tweetId: result.tweetId,
  }
}

function trimTrailingZeros(value: number, fractionDigits: number) {
  return value.toFixed(fractionDigits).replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1')
}

function formatTweetDate(epochSec: number) {
  return new Intl.DateTimeFormat('ja-JP', {
    timeZone: JST_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(epochSec * 1000))
}

function formatTweetTime(epochSec: number) {
  return new Intl.DateTimeFormat('ja-JP', {
    timeZone: JST_TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(epochSec * 1000))
}

function buildTemplateValues(measurement: WithingsMeasurementForTweet) {
  return new Map<string, string>([
    ['weight', measurement.weightKg === null ? '' : trimTrailingZeros(measurement.weightKg, 1)],
    ['fat_ratio', measurement.fatRatio === null ? '' : trimTrailingZeros(measurement.fatRatio, 1)],
    ['bmi', measurement.bmi === null ? '' : trimTrailingZeros(measurement.bmi, 1)],
    ['measured_at', `${formatTweetDate(measurement.measuredAt)} ${formatTweetTime(measurement.measuredAt)} JST`],
    ['measured_date', formatTweetDate(measurement.measuredAt)],
    ['measured_time', formatTweetTime(measurement.measuredAt)],
    ['timestamp', String(measurement.measuredAt)],
  ])
}

function renderTwitterTemplate(template: string, measurement: WithingsMeasurementForTweet) {
  const values = buildTemplateValues(measurement)
  return template
    .replace(/\{\{\s*([a-z0-9_]+)\s*\}\}/gi, (matched, key: string) => values.get(key.toLowerCase()) ?? matched)
    .split('\n')
    .map((line) => line.replace(/[ \t]+$/g, ''))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

async function getLatestWithingsMeasurement(env: Env, userId?: string | null) {
  const sql = userId
    ? `
      SELECT grpid, measured_at, weight_kg, fat_ratio, bmi
      FROM withings_measurements
      WHERE userid = ?1
        AND weight_kg IS NOT NULL
      ORDER BY measured_at DESC, grpid DESC
      LIMIT 1
    `
    : `
      SELECT grpid, measured_at, weight_kg, fat_ratio, bmi
      FROM withings_measurements
      WHERE weight_kg IS NOT NULL
      ORDER BY measured_at DESC, grpid DESC
      LIMIT 1
    `

  const statement = env.DB.prepare(sql)
  const query = userId ? statement.bind(userId) : statement
  return query
    .first<{
      grpid: number
      measured_at: number
      weight_kg: number | null
      fat_ratio: number | null
      bmi: number | null
    }>()
    .then((row) =>
      row
        ? {
            grpid: row.grpid,
            measuredAt: row.measured_at,
            weightKg: row.weight_kg,
            fatRatio: row.fat_ratio,
            bmi: row.bmi,
          }
        : null,
    )
}

async function markTwitterPostPublished(env: Env, measurement: WithingsMeasurementForTweet, tweetId: string | null) {
  const now = nowSeconds()
  await env.DB.prepare(
    `
      UPDATE twitter_post_settings
      SET last_posted_grpid = ?1,
          last_posted_measured_at = ?2,
          last_posted_tweet_id = ?3,
          last_posted_tweet_at = ?4,
          updated_at = ?4
      WHERE id = 1
    `,
  )
    .bind(measurement.grpid, measurement.measuredAt, tweetId, now)
    .run()
}

type CreateTwitterPostOptions = {
  template: string
  withingsUserId?: string | null
  minMeasuredAt?: number | null
  maxMeasuredAt?: number | null
  ignoreAlreadyPosted?: boolean
  updatePostedMarker?: boolean
  prefix?: string
  requireImage?: boolean
}

async function createTwitterPost(env: Env, options: CreateTwitterPostOptions) {
  const connection = await getStoredTwitterConnection(env)
  if (!connection) {
    return { ok: false, reason: 'connection_not_found' as const }
  }
  if (!hasTwitterWriteScope(connection.scope)) {
    return { ok: false, reason: 'missing_tweet_write_scope' as const }
  }

  const measurement = await getLatestWithingsMeasurement(env, options.withingsUserId ?? null)
  if (!measurement || measurement.weightKg === null) {
    return { ok: false, reason: 'measurement_not_found' as const }
  }

  if (typeof options.minMeasuredAt === 'number' && options.minMeasuredAt > 0 && measurement.measuredAt < options.minMeasuredAt) {
    return { ok: false, reason: 'outside_window' as const }
  }
  if (typeof options.maxMeasuredAt === 'number' && options.maxMeasuredAt > 0 && measurement.measuredAt > options.maxMeasuredAt) {
    return { ok: false, reason: 'outside_window' as const }
  }

  const settings = await ensureTwitterPostSettings(env)
  if (!options.ignoreAlreadyPosted && settings.lastPostedGroupId === measurement.grpid) {
    return { ok: false, reason: 'already_posted' as const }
  }

  const prefix = options.prefix?.trim() ? `${options.prefix.trim()} ` : ''
  const text = `${prefix}${renderTwitterTemplate(options.template, measurement)}`.trim()
  if (!text || text.length > TWITTER_POST_MAX_LENGTH) {
    return { ok: false, reason: !text ? ('empty_text' as const) : ('tweet_too_long' as const) }
  }

  let mediaId: string | null = null
  const chartPng = await renderWithingsChartPng(env, {
    rangeDays: 30,
    userId: options.withingsUserId ?? null,
  })
  if (chartPng) {
    if (!hasTwitterMediaWriteScope(connection.scope)) {
      if (options.requireImage) {
        return { ok: false, reason: 'missing_media_write_scope' as const }
      }
    } else {
      const uploaded = await uploadTwitterImageWithRefresh(env, chartPng)
      if (uploaded.ok && uploaded.mediaId) {
        mediaId = uploaded.mediaId
      } else {
        if (uploaded.errorDetail) {
          console.warn('Twitter image upload failed:', uploaded.errorDetail)
        }
        if (options.requireImage) {
          return { ok: false, reason: 'image_upload_failed' as const }
        }
      }
    }
  } else if (options.requireImage) {
    return { ok: false, reason: 'chart_generation_failed' as const }
  }

  const posted = await createTweetWithRefresh(env, text, mediaId)
  if (!posted.ok) {
    return { ok: false, reason: 'post_failed' as const }
  }

  if (options.updatePostedMarker) {
    await markTwitterPostPublished(env, measurement, posted.tweetId)
  }

  return { ok: true, tweetId: posted.tweetId, mode: mediaId ? ('with_image' as const) : ('text_only' as const) }
}

export async function postLatestWithingsMeasurementTweet(
  env: Env,
  withingsUserId: string,
  minMeasuredAt?: number | null,
  maxMeasuredAt?: number | null,
) {
  const settings = await ensureTwitterPostSettings(env)
  if (!settings.autoPostEnabled) {
    return false
  }
  const connection = await getStoredTwitterConnection(env)
  if (!connection) {
    return false
  }
  const posted = await createTwitterPost(env, {
    template: settings.template,
    withingsUserId,
    minMeasuredAt,
    maxMeasuredAt,
    updatePostedMarker: true,
    requireImage: true,
  })
  return posted.ok
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
  const previousConnection = await getStoredTwitterConnection(env)
  const storedConnection = await upsertTwitterConnection(env, tokenBody, user, previousConnection)
  if (!storedConnection) {
    return redirectResponse(
      getPostAuthRedirectUrl(request, env, undefined, 'twitter_token_exchange_failed'),
      getClearTwitterCookies(request),
    )
  }

  await ensureTwitterPostSettings(env)
  return redirectResponse(getPostAuthRedirectUrl(request, env, 'connected'), getClearTwitterCookies(request))
}

export async function handleTwitterStatus(env: Env) {
  const settings = await ensureTwitterPostSettings(env)
  const connection = await getStoredTwitterConnection(env)

  return jsonResponse({
    ok: true,
    connected: Boolean(connection),
    connection: connection
      ? {
          userId: connection.userId,
          username: connection.username,
          name: connection.name,
          scope: connection.scope,
          accessExpiresAt: connection.accessExpiresAt,
          updatedAt: connection.updatedAt,
        }
      : null,
    settings: {
      autoPostEnabled: settings.autoPostEnabled,
      template: settings.template,
      lastPostedGroupId: settings.lastPostedGroupId,
      lastPostedMeasuredAt: settings.lastPostedMeasuredAt,
      lastPostedTweetId: settings.lastPostedTweetId,
      lastPostedTweetAt: settings.lastPostedTweetAt,
    },
  } satisfies TwitterStatusResponse)
}

export async function handleTwitterSettingsUpdate(request: Request, env: Env) {
  const body = await readJsonBody<{ template?: string; autoPostEnabled?: boolean }>(request)
  const template = body?.template?.trim() ?? ''
  const autoPostEnabled = body?.autoPostEnabled !== false
  if (!template) {
    return errorResponse('投稿テンプレートを入力してください', 400)
  }
  if (template.length > TWITTER_TEMPLATE_MAX_LENGTH) {
    return errorResponse('投稿テンプレートが長すぎます', 400)
  }

  const now = nowSeconds()
  const existing = await ensureTwitterPostSettings(env)
  await env.DB.prepare(
    `
      INSERT INTO twitter_post_settings (
        id, auto_post_enabled, template_text, last_posted_grpid, last_posted_measured_at,
        last_posted_tweet_id, last_posted_tweet_at, created_at, updated_at
      )
      VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
      ON CONFLICT(id) DO UPDATE SET
        auto_post_enabled = excluded.auto_post_enabled,
        template_text = excluded.template_text,
        updated_at = excluded.updated_at
    `,
  )
    .bind(
      1,
      autoPostEnabled ? 1 : 0,
      template,
      existing.lastPostedGroupId,
      existing.lastPostedMeasuredAt,
      existing.lastPostedTweetId,
      existing.lastPostedTweetAt,
      existing.createdAt,
      now,
    )
    .run()

  return jsonResponse({
    ok: true,
    settings: {
      autoPostEnabled,
      template,
      lastPostedGroupId: existing.lastPostedGroupId,
      lastPostedMeasuredAt: existing.lastPostedMeasuredAt,
      lastPostedTweetId: existing.lastPostedTweetId,
      lastPostedTweetAt: existing.lastPostedTweetAt,
    },
  })
}

export async function handleTwitterTestPost(request: Request, env: Env) {
  const connection = await getStoredTwitterConnection(env)
  if (!connection) {
    return errorResponse('X連携が未設定です', 400)
  }

  const body = await readJsonBody<{ template?: string }>(request)
  const settings = await ensureTwitterPostSettings(env)
  const template = body?.template?.trim() || settings.template
  if (!template) {
    return errorResponse('投稿テンプレートを入力してください', 400)
  }

  const posted = await createTwitterPost(env, {
    template,
    ignoreAlreadyPosted: true,
    updatePostedMarker: false,
    prefix: '[TEST]',
    requireImage: true,
  })
  if (!posted.ok) {
    if (posted.reason === 'missing_tweet_write_scope') {
      return errorResponse('X再認証を行って tweet.write 権限を付与してください', 400, { reason: posted.reason })
    }
    if (posted.reason === 'missing_media_write_scope') {
      return errorResponse('X再認証を行って media.write 権限を付与してください', 400, { reason: posted.reason })
    }
    if (posted.reason === 'measurement_not_found') {
      return errorResponse('テスト投稿に使えるWithings計測データがありません', 400, { reason: posted.reason })
    }
    if (posted.reason === 'tweet_too_long') {
      return errorResponse('投稿文が長すぎます', 400, { reason: posted.reason })
    }
    return errorResponse('Xテスト投稿に失敗しました', 502, { reason: posted.reason })
  }

  return jsonResponse({ ok: true, tweetId: posted.tweetId, mode: posted.mode })
}
