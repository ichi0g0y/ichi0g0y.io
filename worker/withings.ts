import type { Env } from './types'
import { errorResponse, jsonResponse, nowSeconds, parseCookies } from './utils'
import { buildDiscordEnvironmentLines, formatDiscordTimestamp, notifyDiscord } from './discord-notify'
import { postLatestWithingsMeasurementTweet } from './twitter-post'
import type { PostLatestWithingsMeasurementTweetResult } from './twitter-post'
import type { WithingsMeasurementForTweet } from './twitter-types'
import type { WithingsNotificationPayload } from './withings-types'
import {
  ACCESS_TOKEN_REFRESH_MARGIN_SEC,
  WITHINGS_NOTIFY_APPLI_ACTIVITY,
  WITHINGS_AUTHORIZE_URL,
  WITHINGS_NOTIFY_APPLI_MEASURE,
  WITHINGS_OAUTH_STATE_TTL_SEC,
  WITHINGS_RECENT_WORKOUT_LIMIT,
} from './withings-types'
import {
  buildWithingsStateCookie,
  calculateBmi,
  clearWithingsStateCookie,
  createSignedWithingsState,
  getConfiguredHeightM,
  getWithingsCallbackUrl,
  getWithingsNotifyCallbackUrl,
  getWithingsOAuthScope,
  parseOptionalInteger,
  redirectToApp,
  resolveHeightM,
  resolveWithingsRetentionStart,
  toDateYmd,
  toFiniteInteger,
  toFiniteNumber,
  validateWithingsOAuthConfig,
  verifySignedWithingsState,
} from './withings-helpers'
import {
  clearNotifySubscription,
  ensureConnectionReady,
  exchangeAuthorizationCode,
  getStoredConnection,
  markNotifySubscription,
  subscribeNotify,
  syncMeasurements,
  unsubscribeNotify,
  upsertConnection,
} from './withings-sync'

async function notifyWithingsError(
  env: Env,
  event: string,
  message: string,
  details: Array<string | null | undefined> = [],
) {
  await notifyDiscord(env, 'Withings関連エラー', [
    ...buildDiscordEnvironmentLines(env),
    `event: ${event}`,
    `message: ${message}`,
    ...details,
  ])
}

async function notifyAutoTweetSuccess(
  env: Env,
  result: WithingsNotifyProcessResult,
  mode: 'with_image' | 'text_only',
  tweetId: string | null,
) {
  await notifyDiscord(env, 'X投稿成功', [
    'event: auto_withings_post',
    `tweetId: ${tweetId ?? '(unknown)'}`,
    `mode: ${mode}`,
    `measuredAt: ${formatDiscordTimestamp(result.latestNewWeightMeasurement?.measuredAt) ?? '(unknown)'}`,
    `postedAt: ${formatDiscordTimestamp(nowSeconds()) ?? '(unknown)'}`,
  ])
}

async function parseNotifyPayload(request: Request): Promise<WithingsNotificationPayload> {
  const raw = new Map<string, string>()
  const url = new URL(request.url)
  for (const [key, value] of url.searchParams.entries()) {
    raw.set(key, value)
  }

  if (request.method.toUpperCase() !== 'GET') {
    const formData = await request
      .clone()
      .formData()
      .catch(() => null)
    if (formData) {
      for (const [key, value] of formData.entries()) {
        if (typeof value === 'string') {
          raw.set(key, value)
        }
      }
    } else {
      const payloadText = await request
        .clone()
        .text()
        .catch(() => '')
      if (payloadText) {
        const parsed = new URLSearchParams(payloadText)
        for (const [key, value] of parsed.entries()) {
          raw.set(key, value)
        }
      }
    }
  }

  const rawObject = Object.fromEntries(raw.entries())
  return {
    userId: raw.get('userid') ?? null,
    appli: parseOptionalInteger(raw.get('appli')),
    startDate: parseOptionalInteger(raw.get('startdate')),
    endDate: parseOptionalInteger(raw.get('enddate')),
    dateYmd: raw.get('date')?.trim() || null,
    raw: rawObject,
  }
}

function parseNotifyDateYmd(value: string | null) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null
  }
  const startMs = Date.parse(`${value}T00:00:00Z`)
  if (!Number.isFinite(startMs)) {
    return null
  }
  const startDate = Math.floor(startMs / 1000)
  return {
    startDate,
    endDate: startDate + (24 * 60 * 60) - 1,
  }
}

function resolveNotifySyncWindow(payload: WithingsNotificationPayload) {
  if (typeof payload.startDate === 'number' || typeof payload.endDate === 'number') {
    return {
      startDate: payload.startDate,
      endDate: payload.endDate,
    }
  }

  if (payload.appli === WITHINGS_NOTIFY_APPLI_ACTIVITY) {
    return parseNotifyDateYmd(payload.dateYmd)
  }

  return null
}

type WithingsNotifyAuthMode = 'token' | 'legacy_callback' | 'simulation'

type NotifySubscriptionRepairResult = {
  attempted: boolean
  repaired: boolean
  callbackUrl: string | null
  usedFallback: boolean
  error: string | null
  failedApplis: number[]
}

type WithingsNotifyProcessResult = {
  ok: boolean
  authMode: WithingsNotifyAuthMode
  payloadUserMatched: boolean
  syncOk: boolean
  latestNewWeightMeasurement: WithingsMeasurementForTweet | null
  tweetAttempted: boolean
  tweetPosted: boolean
  tweetResult: PostLatestWithingsMeasurementTweetResult | null
  skipReason:
    | 'connection_not_found'
    | 'connection_unavailable'
    | 'payload_user_mismatch'
    | 'sync_failed'
    | 'non_measure_notify'
    | 'no_new_weight_measurement'
    | 'dry_run'
    | null
  subscriptionRepair: NotifySubscriptionRepairResult
}

const DEFAULT_SUBSCRIPTION_REPAIR: NotifySubscriptionRepairResult = {
  attempted: false,
  repaired: false,
  callbackUrl: null,
  usedFallback: false,
  error: null,
  failedApplis: [],
}

function buildNotifyResult(
  authMode: WithingsNotifyAuthMode,
  overrides: Partial<Omit<WithingsNotifyProcessResult, 'authMode'>>,
): WithingsNotifyProcessResult {
  return {
    ok: false,
    authMode,
    payloadUserMatched: false,
    syncOk: false,
    latestNewWeightMeasurement: null,
    tweetAttempted: false,
    tweetPosted: false,
    tweetResult: null,
    skipReason: null,
    subscriptionRepair: DEFAULT_SUBSCRIPTION_REPAIR,
    ...overrides,
  }
}

async function resolveReadyWithingsConnection(env: Env) {
  const storedConnection = await getStoredConnection(env)
  if (!storedConnection) {
    return {
      status: 'missing' as const,
      storedConnection: null,
      connection: null,
    }
  }

  const connection = await ensureConnectionReady(env)
  if (!connection) {
    return {
      status: 'unavailable' as const,
      storedConnection,
      connection: null,
    }
  }

  return {
    status: 'ready' as const,
    storedConnection,
    connection,
  }
}

function buildWithingsConnectionUnavailableMessage() {
  return 'Withings連携情報は保存されていますが、現在利用できません。再連携または設定確認を行ってください。'
}

function sanitizeWithingsNotifyCallbackUrl(rawUrl: string | null | undefined) {
  const value = rawUrl?.trim() || ''
  if (!value) {
    return null
  }

  try {
    const parsed = new URL(value)
    parsed.search = ''
    return parsed.toString()
  } catch {
    return null
  }
}

function normalizeNotifyCallbackPath(rawUrl: string) {
  const url = new URL(rawUrl)
  const pathname = url.pathname.length > 1 && url.pathname.endsWith('/') ? url.pathname.slice(0, -1) : url.pathname
  return `${url.origin}${pathname}`
}

function shouldAllowLegacyNotify(request: Request, connection: Awaited<ReturnType<typeof getStoredConnection>>, payload: WithingsNotificationPayload) {
  if (!connection?.notifyCallbackUrl || !payload.userId || payload.userId !== connection.userId) {
    return false
  }

  const subscribedUrl = new URL(connection.notifyCallbackUrl)
  if (subscribedUrl.searchParams.get('token')?.trim()) {
    return false
  }

  return normalizeNotifyCallbackPath(connection.notifyCallbackUrl) === normalizeNotifyCallbackPath(request.url)
}

async function repairNotifySubscriptionIfNeeded(
  request: Request,
  env: Env,
  connection: NonNullable<Awaited<ReturnType<typeof ensureConnectionReady>>>,
) {
  const expectedCallbackUrl = getWithingsNotifyCallbackUrl(request, env)
  const currentCallbackUrl = connection.notifyCallbackUrl?.trim() || null
  if (currentCallbackUrl === expectedCallbackUrl) {
    return {
      attempted: false,
      repaired: false,
      callbackUrl: currentCallbackUrl,
      usedFallback: false,
      error: null,
      failedApplis: [],
    } satisfies NotifySubscriptionRepairResult
  }

  const notifyResult = await subscribeNotify(request, env, connection)
  if (!notifyResult.ok) {
    return {
      attempted: true,
      repaired: false,
      callbackUrl: notifyResult.callbackUrl,
      usedFallback: notifyResult.usedFallback,
      error: notifyResult.error,
      failedApplis: notifyResult.failedApplis,
    } satisfies NotifySubscriptionRepairResult
  }

  await markNotifySubscription(env, connection, notifyResult.callbackUrl)
  return {
    attempted: true,
    repaired: true,
    callbackUrl: notifyResult.callbackUrl,
    usedFallback: notifyResult.usedFallback,
    error: null,
    failedApplis: notifyResult.failedApplis,
  } satisfies NotifySubscriptionRepairResult
}

async function processWithingsNotify(
  request: Request,
  env: Env,
  payload: WithingsNotificationPayload,
  options: {
    authMode: WithingsNotifyAuthMode
    dryRun?: boolean
    repairSubscription?: boolean
  },
): Promise<WithingsNotifyProcessResult> {
  const connectionState = await resolveReadyWithingsConnection(env)
  if (!connectionState.connection) {
    return buildNotifyResult(options.authMode, {
      skipReason: connectionState.status === 'missing' ? 'connection_not_found' : 'connection_unavailable',
    })
  }
  const connection = connectionState.connection

  if (payload.userId && payload.userId !== connection.userId) {
    return buildNotifyResult(options.authMode, {
      skipReason: 'payload_user_mismatch',
      subscriptionRepair: { ...DEFAULT_SUBSCRIPTION_REPAIR, callbackUrl: connection.notifyCallbackUrl },
    })
  }

  const notifyWindow = resolveNotifySyncWindow(payload)
  const synced = await syncMeasurements(env, connection, notifyWindow?.startDate ?? null, notifyWindow?.endDate ?? null)
  const repairConnection = options.repairSubscription ? await ensureConnectionReady(env) : connection
  const subscriptionRepair = options.repairSubscription && repairConnection
    ? await repairNotifySubscriptionIfNeeded(request, env, repairConnection)
    : { ...DEFAULT_SUBSCRIPTION_REPAIR, callbackUrl: connection.notifyCallbackUrl }

  if (!synced.ok) {
    return buildNotifyResult(options.authMode, {
      payloadUserMatched: true,
      latestNewWeightMeasurement: synced.latestNewWeightMeasurement,
      skipReason: 'sync_failed',
      subscriptionRepair,
    })
  }

  if (payload.appli !== WITHINGS_NOTIFY_APPLI_MEASURE) {
    return buildNotifyResult(options.authMode, {
      ok: true,
      payloadUserMatched: true,
      syncOk: true,
      latestNewWeightMeasurement: synced.latestNewWeightMeasurement,
      skipReason: 'non_measure_notify',
      subscriptionRepair,
    })
  }

  if (!synced.latestNewWeightMeasurement) {
    return buildNotifyResult(options.authMode, {
      ok: true,
      payloadUserMatched: true,
      syncOk: true,
      skipReason: 'no_new_weight_measurement',
      subscriptionRepair,
    })
  }

  if (options.dryRun) {
    return buildNotifyResult(options.authMode, {
      ok: true,
      payloadUserMatched: true,
      syncOk: true,
      latestNewWeightMeasurement: synced.latestNewWeightMeasurement,
      skipReason: 'dry_run',
      subscriptionRepair,
    })
  }

  const tweetResult = await postLatestWithingsMeasurementTweet(
    env,
    connection.userId,
    synced.latestNewWeightMeasurement.grpid,
    synced.latestNewWeightMeasurement.measuredAt,
    synced.latestNewWeightMeasurement.measuredAt,
  )

  return buildNotifyResult(options.authMode, {
    ok: tweetResult.ok,
    payloadUserMatched: true,
    syncOk: true,
    latestNewWeightMeasurement: synced.latestNewWeightMeasurement,
    tweetAttempted: true,
    tweetPosted: tweetResult.ok,
    tweetResult,
    subscriptionRepair,
  })
}

function buildSimulatedNotifyMessage(result: WithingsNotifyProcessResult) {
  if (result.skipReason === 'connection_not_found') {
    return 'Withings連携が未設定です。'
  }
  if (result.skipReason === 'connection_unavailable') {
    return buildWithingsConnectionUnavailableMessage()
  }
  if (result.skipReason === 'sync_failed') {
    return '擬似Notifyの同期に失敗しました。'
  }
  if (result.skipReason === 'no_new_weight_measurement') {
    return '擬似Notifyを実行しました。新しい体重計測は見つからず、X投稿は抑止しました。'
  }
  if (result.skipReason === 'dry_run' && result.latestNewWeightMeasurement) {
    return '擬似Notifyを実行しました。新しい体重計測を検出しましたが、X投稿は dry-run で抑止しました。'
  }
  if (result.skipReason === 'non_measure_notify') {
    return '擬似Notifyを実行しました。体重系通知ではないため、X投稿は対象外です。'
  }
  return '擬似Notifyを実行しました。X投稿は抑止しています。'
}

function buildNotifySubscriptionMessage(
  baseMessage: string,
  details: Array<[label: string, value: string | number | boolean | null | undefined]>,
) {
  const lines = [baseMessage]
  for (const [label, value] of details) {
    if (value === null || value === undefined || value === '') {
      continue
    }
    lines.push(`${label}: ${String(value)}`)
  }
  return lines.join('\n')
}

export async function handleWithingsStatus(env: Env) {
  const connection = await getStoredConnection(env)
  const targetUserId = connection?.userId ?? null
  const requiredScopes = getWithingsOAuthScope(env)
    .split(',')
    .map((value) => value.trim())
    .filter((value) => value.length > 0)
  const grantedScopes = (connection?.scope ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter((value) => value.length > 0)
  const missingScopes = requiredScopes.filter((scope) => !grantedScopes.includes(scope))

  const latestMeasurement = targetUserId
    ? await env.DB.prepare(
        `
          SELECT userid, grpid, measured_at, weight_kg, fat_ratio, bmi
          FROM withings_measurements
          WHERE userid = ?1
          ORDER BY measured_at DESC
          LIMIT 1
        `,
      )
        .bind(targetUserId)
        .first<{
          userid: string
          grpid: number
          measured_at: number
          weight_kg: number | null
          fat_ratio: number | null
          bmi: number | null
        }>()
    : null

  const latestHeightM = resolveHeightM(connection, env)
  const latestBmi = latestMeasurement?.bmi ?? calculateBmi(latestMeasurement?.weight_kg ?? null, latestHeightM)
  const latestMetrics = latestMeasurement
    ? [
        {
          typeId: 1,
          metricKey: 'weight',
          labelJa: '体重',
          labelEn: 'Weight',
          unit: 'kg',
          value: latestMeasurement.weight_kg,
          measuredAt: latestMeasurement.measured_at,
        },
        {
          typeId: 6,
          metricKey: 'fat_ratio',
          labelJa: '体脂肪率',
          labelEn: 'Body Fat',
          unit: '%',
          value: latestMeasurement.fat_ratio,
          measuredAt: latestMeasurement.measured_at,
        },
        {
          typeId: 999001,
          metricKey: 'bmi',
          labelJa: 'BMI',
          labelEn: 'BMI',
          unit: null,
          value: latestBmi,
          measuredAt: latestMeasurement.measured_at,
        },
      ].filter((metric) => typeof metric.value === 'number' && Number.isFinite(metric.value))
    : []

  const recentWorkoutRows = targetUserId
    ? await env.DB.prepare(
        `
          SELECT
            ww.data_key,
            ww.measured_at,
            ww.workout_id,
            ww.category_id,
            wc.category_key AS category_key,
            wc.label_ja AS category_label_ja,
            wc.label_en AS category_label_en,
            ww.start_at,
            ww.end_at,
            ww.date_ymd,
            ww.timezone,
            ww.distance_m,
            ww.calories_kcal,
            ww.duration_sec,
            ww.steps,
            ww.intensity
          FROM withings_workouts ww
          LEFT JOIN withings_workout_categories wc
            ON wc.category_id = ww.category_id
          WHERE ww.userid = ?1
          ORDER BY ww.measured_at DESC, ww.data_key DESC
          LIMIT ${WITHINGS_RECENT_WORKOUT_LIMIT}
        `,
      )
        .bind(targetUserId)
        .all<{
          data_key: string
          measured_at: number
          workout_id: number | null
          category_id: number | null
          category_key: string | null
          category_label_ja: string | null
          category_label_en: string | null
          start_at: number | null
          end_at: number | null
          date_ymd: string | null
          timezone: string | null
          distance_m: number | null
          calories_kcal: number | null
          duration_sec: number | null
          steps: number | null
          intensity: number | null
        }>()
    : {
        results: [] as Array<{
          data_key: string
          measured_at: number
          workout_id: number | null
          category_id: number | null
          category_key: string | null
          category_label_ja: string | null
          category_label_en: string | null
          start_at: number | null
          end_at: number | null
          date_ymd: string | null
          timezone: string | null
          distance_m: number | null
          calories_kcal: number | null
          duration_sec: number | null
          steps: number | null
          intensity: number | null
        }>,
      }

  const recentWorkouts = (recentWorkoutRows.results ?? []).map((row) => {
    const startAt = toFiniteInteger(row.start_at)
    const endAt = toFiniteInteger(row.end_at)
    const distanceM = toFiniteNumber(row.distance_m)
    const calories = toFiniteNumber(row.calories_kcal)
    const detectedDurationSec = toFiniteInteger(row.duration_sec)
    const workoutCategoryId = toFiniteInteger(row.category_id)
    const fallbackCategoryLabel = workoutCategoryId === null ? '不明' : `Type #${workoutCategoryId}`
    const fallbackCategoryLabelEn = workoutCategoryId === null ? 'Unknown' : `Type #${workoutCategoryId}`
    return {
      dataKey: row.data_key,
      measuredAt: toFiniteInteger(row.measured_at) ?? 0,
      workoutId: toFiniteInteger(row.workout_id),
      workoutCategoryId,
      workoutCategoryKey: row.category_key,
      workoutCategoryLabelJa: row.category_label_ja ?? fallbackCategoryLabel,
      workoutCategoryLabelEn: row.category_label_en ?? fallbackCategoryLabelEn,
      dateYmd: row.date_ymd,
      timezone: row.timezone,
      startAt,
      endAt,
      durationSec: startAt !== null && endAt !== null && endAt > startAt ? endAt - startAt : detectedDurationSec,
      distanceMeters: distanceM,
      caloriesKcal: calories,
      steps: toFiniteInteger(row.steps),
      intensity: toFiniteInteger(row.intensity),
    }
  })

  const recentRows = targetUserId
    ? await env.DB.prepare(
        `
          SELECT measured_at, weight_kg, fat_ratio, bmi
          FROM withings_measurements
          WHERE userid = ?1
            AND weight_kg IS NOT NULL
            AND measured_at >= ?2
          ORDER BY measured_at ASC
        `,
      )
        .bind(targetUserId, resolveWithingsRetentionStart(nowSeconds()))
        .all<{ measured_at: number; weight_kg: number; fat_ratio: number | null; bmi: number | null }>()
    : { results: [] as Array<{ measured_at: number; weight_kg: number; fat_ratio: number | null; bmi: number | null }> }

  const recentWeights = (recentRows.results ?? []).map((row) => ({
    measuredAt: row.measured_at,
    weightKg: row.weight_kg,
    fatRatio: row.fat_ratio,
    bmi: row.bmi ?? calculateBmi(row.weight_kg, latestHeightM),
  }))

  return jsonResponse({
    ok: true,
    connected: Boolean(connection),
    requiredScopes,
    missingScopes,
    connection: connection
      ? {
          userId: connection.userId,
          scope: connection.scope,
          accessExpiresAt: connection.accessExpiresAt,
          notifyCallbackUrl: connection.notifyCallbackUrl ? '(設定済み)' : null,
          notifySubscribedAt: connection.notifySubscribedAt,
          lastSyncedAt: connection.lastSyncedAt,
        }
      : null,
    latestMeasurement: latestMeasurement
      ? {
          measuredAt: latestMeasurement.measured_at,
          weightKg: latestMeasurement.weight_kg,
          bmi: latestBmi,
          fatRatio: latestMeasurement.fat_ratio,
          fatMassKg: null,
          leanMassKg: null,
        }
      : null,
    latestMetrics,
    recentWorkouts,
    recentWeights,
  })
}

export async function handleWithingsAuthStart(request: Request, env: Env) {
  const configError = validateWithingsOAuthConfig(env)
  if (configError) {
    return errorResponse(configError, 500)
  }

  const state = await createSignedWithingsState(env)
  const authorizeUrl = new URL(WITHINGS_AUTHORIZE_URL)
  authorizeUrl.searchParams.set('response_type', 'code')
  authorizeUrl.searchParams.set('client_id', env.WITHINGS_CLIENT_ID)
  authorizeUrl.searchParams.set('redirect_uri', getWithingsCallbackUrl(request, env))
  authorizeUrl.searchParams.set('scope', getWithingsOAuthScope(env))
  authorizeUrl.searchParams.set('state', state)

  const response = jsonResponse({
    ok: true,
    authorizeUrl: authorizeUrl.toString(),
    callbackUrl: getWithingsCallbackUrl(request, env),
    notifyUrl: getWithingsNotifyCallbackUrl(request, env),
  })
  response.headers.append('Set-Cookie', buildWithingsStateCookie(state, request, WITHINGS_OAUTH_STATE_TTL_SEC))
  return response
}

export async function handleWithingsAuthCallback(request: Request, env: Env, ctx?: ExecutionContext) {
  const method = request.method.toUpperCase()
  const url = new URL(request.url)
  const hasOAuthParams = url.searchParams.has('code') || url.searchParams.has('error') || url.searchParams.has('state')

  // Withings 側の接続テストで HEAD / パラメータ無しGET が来ても 200 を返す。
  if (method === 'HEAD') {
    return new Response(null, { status: 200 })
  }

  // 通知callbackが OAuth callback と同じURLしか許可されない構成に備え、POST通知を受け付ける。
  if (method === 'POST' && !hasOAuthParams) {
    return handleWithingsNotify(request, env, ctx)
  }

  if (method === 'GET' && !hasOAuthParams) {
    return jsonResponse({ ok: true, healthcheck: true, endpoint: 'withings_oauth_callback' })
  }

  try {
    const configError = validateWithingsOAuthConfig(env)
    if (configError) {
      return redirectToApp(request, env, undefined, 'withings_config_error', [clearWithingsStateCookie(request)])
    }

    const oauthError = url.searchParams.get('error')
    if (oauthError) {
      return redirectToApp(request, env, undefined, 'withings_oauth_denied', [clearWithingsStateCookie(request)])
    }

    const state = (url.searchParams.get('state') ?? '').trim()
    const code = (url.searchParams.get('code') ?? '').trim()
    const stateCookie = parseCookies(request).get('withings_oauth_state')
    const stateMatchesCookie = Boolean(state && stateCookie && state === stateCookie)
    const stateMatchesSignedToken = state ? await verifySignedWithingsState(state, env) : false
    if (!state || !code || (!stateMatchesCookie && !stateMatchesSignedToken)) {
      return redirectToApp(request, env, undefined, 'withings_state_mismatch', [clearWithingsStateCookie(request)])
    }

    const tokenBody = await exchangeAuthorizationCode(code, request, env)
    if (!tokenBody) {
      return redirectToApp(request, env, undefined, 'withings_token_exchange_failed', [clearWithingsStateCookie(request)])
    }

    const previousConnection = await getStoredConnection(env)
    const connection = await upsertConnection(
      env,
      tokenBody,
      previousConnection?.notifyCallbackUrl ?? null,
      previousConnection?.notifySubscribedAt ?? null,
      previousConnection?.heightM ?? getConfiguredHeightM(env),
    )
    if (!connection) {
      return redirectToApp(request, env, undefined, 'withings_token_invalid', [clearWithingsStateCookie(request)])
    }

    const notifyResult = await subscribeNotify(request, env, connection)
    if (notifyResult.ok) {
      await markNotifySubscription(env, connection, notifyResult.callbackUrl)
    } else {
      await notifyWithingsError(env, 'auth_callback_notify_subscribe', 'Withings通知(Webhook)の登録に失敗しました。', [
        `callbackUrl: ${notifyResult.callbackUrl}`,
        `status: ${notifyResult.status}`,
        `error: ${notifyResult.error}`,
        `usedFallback: ${String(notifyResult.usedFallback)}`,
        `failedApplis: ${notifyResult.failedApplis.join(',')}`,
      ])
      console.warn(
        '[withings] notify subscribe failed',
        JSON.stringify({
          callbackUrl: notifyResult.callbackUrl,
          status: notifyResult.status,
          error: notifyResult.error,
          usedFallback: notifyResult.usedFallback,
          subscribedApplis: notifyResult.subscribedApplis,
          failedApplis: notifyResult.failedApplis,
        }),
      )
    }

    const syncInBackground = async () => {
      try {
        return await syncMeasurements(env, connection, null, null)
      } catch (error) {
        await notifyWithingsError(env, 'auth_callback_initial_sync_exception', 'Withings初回同期で例外が発生しました。', [
          error instanceof Error ? `error: ${error.message}` : `error: ${String(error)}`,
        ])
        console.error(
          '[withings] initial sync threw exception',
          error instanceof Error ? error.stack ?? error.message : String(error),
        )
        return { ok: false, latestNewWeightMeasurement: null }
      }
    }
    if (ctx) {
      ctx.waitUntil(
        syncInBackground().then(async (synced) => {
          if (!synced.ok) {
            await notifyWithingsError(env, 'auth_callback_initial_sync', 'Withings初回同期に失敗しました。')
          }
        }),
      )
    } else {
      const synced = await syncInBackground()
      if (!synced.ok) {
        await notifyWithingsError(env, 'auth_callback_initial_sync', 'Withings初回同期に失敗しました。')
        return redirectToApp(request, env, 'connected', 'withings_sync_failed', [clearWithingsStateCookie(request)])
      }
    }

    if (!notifyResult.ok) {
      return redirectToApp(request, env, 'connected', 'withings_notify_subscribe_failed', [clearWithingsStateCookie(request)])
    }

    return redirectToApp(request, env, 'connected', undefined, [clearWithingsStateCookie(request)])
  } catch (error) {
    await notifyWithingsError(env, 'auth_callback_exception', 'Withings認証コールバックで例外が発生しました。', [
      error instanceof Error ? `error: ${error.message}` : `error: ${String(error)}`,
    ])
    console.error(
      '[withings] auth callback threw exception',
      error instanceof Error ? error.stack ?? error.message : String(error),
    )
    return redirectToApp(request, env, undefined, 'withings_sync_failed', [clearWithingsStateCookie(request)])
  }
}

export async function handleWithingsNotify(request: Request, env: Env, ctx?: ExecutionContext) {
  const method = request.method.toUpperCase()
  const url = new URL(request.url)

  if (method === 'HEAD') {
    return new Response(null, { status: 200 })
  }

  if (method === 'GET') {
    return jsonResponse({ ok: true, accepted: true, healthcheck: true })
  }

  if (method === 'POST') {
    const rawBody = await request
      .clone()
      .text()
      .catch(() => '')
    if (!rawBody.trim()) {
      return jsonResponse({ ok: true, accepted: true, healthcheck: true })
    }
  }

  // トークン認証はenv変数の比較のみでDB不要なので、先にチェックして即座にレスポンスを返す。
  // D1コールドスタート時にgetStoredConnectionが2秒を超えるため、DB操作はすべてwaitUntilに移す。
  const notifySecret = env.WITHINGS_NOTIFY_SECRET?.trim() || null
  const token = url.searchParams.get('token')?.trim() || null
  const tokenAuthOk = Boolean(notifySecret && token === notifySecret)

  if (!tokenAuthOk && !notifySecret) {
    return errorResponse('WITHINGS_NOTIFY_SECRET が未設定です', 401)
  }

  const runSync = async () => {
    try {
      const payload = await parseNotifyPayload(request)

      let authMode: WithingsNotifyAuthMode | null = null
      if (tokenAuthOk) {
        authMode = 'token'
      } else {
        const storedConnection = await getStoredConnection(env)
        if (shouldAllowLegacyNotify(request, storedConnection, payload)) {
          authMode = 'legacy_callback'
        }
      }

      if (!authMode) {
        console.warn('[withings] notify auth failed - token mismatch and legacy not allowed')
        return
      }

      const result = await processWithingsNotify(request, env, payload, {
        authMode,
        dryRun: false,
        repairSubscription: authMode === 'legacy_callback',
      })
      console.info('[withings] notify processed', {
        authMode: result.authMode,
        payloadUserMatched: result.payloadUserMatched,
        syncOk: result.syncOk,
        latestNewWeightMeasurement: result.latestNewWeightMeasurement
          ? {
              grpid: result.latestNewWeightMeasurement.grpid,
              measuredAt: result.latestNewWeightMeasurement.measuredAt,
            }
          : null,
        tweetPosted: result.tweetPosted,
        tweetReason: result.tweetResult?.ok ? null : result.tweetResult?.reason ?? result.skipReason,
        subscriptionRepair: {
          attempted: result.subscriptionRepair.attempted,
          repaired: result.subscriptionRepair.repaired,
          callbackUrl: result.subscriptionRepair.callbackUrl,
          usedFallback: result.subscriptionRepair.usedFallback,
          error: result.subscriptionRepair.error,
          failedApplis: result.subscriptionRepair.failedApplis,
        },
      })
      if (result.subscriptionRepair.attempted && !result.subscriptionRepair.repaired) {
        await notifyWithingsError(env, 'notify_subscription_repair', 'Withings通知(Webhook)の購読修復に失敗しました。', [
          `callbackUrl: ${result.subscriptionRepair.callbackUrl}`,
          `error: ${result.subscriptionRepair.error}`,
          `usedFallback: ${String(result.subscriptionRepair.usedFallback)}`,
          `failedApplis: ${result.subscriptionRepair.failedApplis.join(',')}`,
        ])
        console.warn('[withings] notify subscription repair failed', {
          callbackUrl: result.subscriptionRepair.callbackUrl,
          error: result.subscriptionRepair.error,
          failedApplis: result.subscriptionRepair.failedApplis,
          usedFallback: result.subscriptionRepair.usedFallback,
        })
      }
      if (result.skipReason === 'connection_not_found') {
        await notifyWithingsError(env, 'notify_connection_not_found', 'Withings連携が未設定のため通知処理を継続できませんでした。')
      } else if (result.skipReason === 'connection_unavailable') {
        const storedConn = await getStoredConnection(env)
        const now = nowSeconds()
        const accessExpiresAt = storedConn?.accessExpiresAt ?? null
        const refreshDue = typeof accessExpiresAt === 'number' ? accessExpiresAt <= now + ACCESS_TOKEN_REFRESH_MARGIN_SEC : null
        await notifyWithingsError(
          env,
          'notify_connection_unavailable',
          'Withings連携情報は保存されていますが、現在利用できないため通知処理を継続できませんでした。',
          [
            `userId: ${storedConn?.userId ?? '(unknown)'}`,
            `accessExpiresAt: ${formatDiscordTimestamp(accessExpiresAt) ?? '(unknown)'}`,
            `lastSyncedAt: ${formatDiscordTimestamp(storedConn?.lastSyncedAt) ?? '(unknown)'}`,
            `notifyCallbackUrl: ${sanitizeWithingsNotifyCallbackUrl(storedConn?.notifyCallbackUrl) ?? '(unknown)'}`,
            `refreshDue: ${refreshDue === null ? '(unknown)' : String(refreshDue)}`,
            'diagnosis: access token refresh failed while processing notify',
          ],
        )
      } else if (result.skipReason === 'payload_user_mismatch') {
        await notifyWithingsError(env, 'notify_payload_user_mismatch', 'Withings通知のユーザーIDが保存済みユーザーと一致しません。')
      } else if (result.skipReason === 'sync_failed') {
        await notifyWithingsError(env, 'notify_sync_failed', 'Withings通知受信後の同期に失敗しました。')
      } else if (result.tweetAttempted && result.tweetResult && !result.tweetResult.ok) {
        await notifyWithingsError(env, 'notify_auto_post_failed', 'Withings通知でのX自動投稿に失敗しました。', [
          `reason: ${result.tweetResult.reason}`,
          `measuredAt: ${formatDiscordTimestamp(result.latestNewWeightMeasurement?.measuredAt) ?? '(unknown)'}`,
        ])
      } else if (result.tweetPosted && result.tweetResult && result.tweetResult.ok) {
        await notifyAutoTweetSuccess(env, result, result.tweetResult.mode, result.tweetResult.tweetId)
      }
    } catch (error) {
      await notifyWithingsError(env, 'notify_exception', 'Withings通知処理で例外が発生しました。', [
        error instanceof Error ? `error: ${error.message}` : `error: ${String(error)}`,
      ])
      console.error(
        '[withings] notify sync threw exception',
        error instanceof Error ? error.stack ?? error.message : String(error),
      )
    }
  }

  if (ctx) {
    ctx.waitUntil(runSync())
    return new Response(null, { status: 200 })
  }

  await runSync()
  return new Response(null, { status: 200 })
}

export async function handleWithingsSync(env: Env, request?: Request) {
  const configError = validateWithingsOAuthConfig(env)
  if (configError) {
    return errorResponse(configError, 500)
  }

  const connectionState = await resolveReadyWithingsConnection(env)
  if (!connectionState.connection) {
    return connectionState.status === 'missing'
      ? errorResponse('Withings連携が未設定です', 400)
      : errorResponse(buildWithingsConnectionUnavailableMessage(), 502)
  }
  const connection = connectionState.connection

  let startDate: number | null = null
  let endDate: number | null = null
  if (request) {
    const url = new URL(request.url)
    startDate = parseOptionalInteger(url.searchParams.get('startdate'))
    endDate = parseOptionalInteger(url.searchParams.get('enddate'))
  }

  const synced = await syncMeasurements(env, connection, startDate, endDate)
  if (!synced.ok) {
    await notifyWithingsError(env, 'manual_sync_failed', 'Withingsデータの同期に失敗しました。')
    return errorResponse('Withingsデータの同期に失敗しました', 502)
  }

  let notifySubscription = null
  if (request) {
    const refreshedConnection = await ensureConnectionReady(env)
    if (refreshedConnection) {
      notifySubscription = await repairNotifySubscriptionIfNeeded(request, env, refreshedConnection)
      if (notifySubscription.attempted && !notifySubscription.repaired) {
        await notifyWithingsError(env, 'manual_sync_subscription_repair', 'Withings通知(Webhook)の購読修復に失敗しました。', [
          `callbackUrl: ${notifySubscription.callbackUrl}`,
          `error: ${notifySubscription.error}`,
          `usedFallback: ${String(notifySubscription.usedFallback)}`,
          `failedApplis: ${notifySubscription.failedApplis.join(',')}`,
        ])
        console.warn('[withings] sync notify subscription repair failed', {
          callbackUrl: notifySubscription.callbackUrl,
          error: notifySubscription.error,
          failedApplis: notifySubscription.failedApplis,
          usedFallback: notifySubscription.usedFallback,
        })
      }
    }
  }

  return jsonResponse({
    ok: true,
    startDate,
    endDate,
    notifySubscription,
  })
}

export async function handleWithingsNotifySubscribe(request: Request, env: Env) {
  const connectionState = await resolveReadyWithingsConnection(env)
  if (!connectionState.connection) {
    return connectionState.status === 'missing'
      ? errorResponse('Withings連携が未設定です', 400)
      : errorResponse(buildWithingsConnectionUnavailableMessage(), 502)
  }
  const connection = connectionState.connection

  const notifyResult = await subscribeNotify(request, env, connection)
  if (!notifyResult.ok) {
    await notifyWithingsError(env, 'manual_subscribe_failed', 'Withings通知(Webhook)の登録に失敗しました。', [
      `callbackUrl: ${notifyResult.callbackUrl}`,
      `status: ${notifyResult.status}`,
      `error: ${notifyResult.error}`,
      `usedFallback: ${String(notifyResult.usedFallback)}`,
      `failedApplis: ${notifyResult.failedApplis.join(',')}`,
    ])
    const message = buildNotifySubscriptionMessage('Withings通知(Webhook)の登録に失敗しました。', [
      ['callbackUrl', notifyResult.callbackUrl],
      ['status', notifyResult.status],
      ['error', notifyResult.error],
      ['usedFallback', notifyResult.usedFallback],
      ['failedApplis', notifyResult.failedApplis.join(',')],
    ])
    console.warn('[withings] notify subscribe failed', {
      callbackUrl: notifyResult.callbackUrl,
      status: notifyResult.status,
      error: notifyResult.error,
      usedFallback: notifyResult.usedFallback,
      subscribedApplis: notifyResult.subscribedApplis,
      failedApplis: notifyResult.failedApplis,
    })
    return errorResponse(message, 502, {
      callbackUrl: notifyResult.callbackUrl,
      status: notifyResult.status,
      error: notifyResult.error,
      usedFallback: notifyResult.usedFallback,
      subscribedApplis: notifyResult.subscribedApplis,
      failedApplis: notifyResult.failedApplis,
    })
  }

  const subscription = await markNotifySubscription(env, connection, notifyResult.callbackUrl)
  const message = buildNotifySubscriptionMessage('Withings通知(Webhook)を登録しました。', [
    ['callbackUrl', subscription.callbackUrl],
    ['usedFallback', notifyResult.usedFallback],
    ['subscribedApplis', notifyResult.subscribedApplis.join(',')],
    ['failedApplis', notifyResult.failedApplis.join(',')],
  ])
  console.info('[withings] notify subscribe succeeded', {
    callbackUrl: subscription.callbackUrl,
    usedFallback: notifyResult.usedFallback,
    subscribedApplis: notifyResult.subscribedApplis,
    failedApplis: notifyResult.failedApplis,
  })
  return jsonResponse({
    ok: true,
    message,
    callbackUrl: subscription.callbackUrl,
    notifySubscribedAt: subscription.notifySubscribedAt,
    usedFallback: notifyResult.usedFallback,
    subscribedApplis: notifyResult.subscribedApplis,
    failedApplis: notifyResult.failedApplis,
  })
}

export async function handleWithingsNotifyUnsubscribe(request: Request, env: Env) {
  const connectionState = await resolveReadyWithingsConnection(env)
  if (!connectionState.connection) {
    return connectionState.status === 'missing'
      ? errorResponse('Withings連携が未設定です', 400)
      : errorResponse(buildWithingsConnectionUnavailableMessage(), 502)
  }
  const connection = connectionState.connection

  const notifyResult = await unsubscribeNotify(request, env, connection)
  if (!notifyResult.ok) {
    await notifyWithingsError(env, 'manual_unsubscribe_failed', 'Withings通知(Webhook)の解除に失敗しました。', [
      `callbackUrls: ${notifyResult.callbackUrls.join(', ')}`,
      `status: ${notifyResult.status}`,
      `error: ${notifyResult.error}`,
      `failedApplis: ${notifyResult.failedApplis.join(',')}`,
    ])
    const message = buildNotifySubscriptionMessage('Withings通知(Webhook)の解除に失敗しました。', [
      ['callbackUrls', notifyResult.callbackUrls.join(', ')],
      ['status', notifyResult.status],
      ['error', notifyResult.error],
      ['failedApplis', notifyResult.failedApplis.join(',')],
    ])
    console.warn('[withings] notify unsubscribe failed', {
      callbackUrls: notifyResult.callbackUrls,
      status: notifyResult.status,
      error: notifyResult.error,
      unsubscribedApplis: notifyResult.unsubscribedApplis,
      failedApplis: notifyResult.failedApplis,
    })
    return errorResponse(message, 502, {
      callbackUrls: notifyResult.callbackUrls,
      status: notifyResult.status,
      error: notifyResult.error,
      unsubscribedApplis: notifyResult.unsubscribedApplis,
      failedApplis: notifyResult.failedApplis,
    })
  }

  await clearNotifySubscription(env)
  const message = buildNotifySubscriptionMessage('Withings通知(Webhook)を解除しました。', [
    ['callbackUrls', notifyResult.callbackUrls.join(', ')],
    ['unsubscribedApplis', notifyResult.unsubscribedApplis.join(',')],
    ['failedApplis', notifyResult.failedApplis.join(',')],
  ])
  console.info('[withings] notify unsubscribe succeeded', {
    callbackUrls: notifyResult.callbackUrls,
    unsubscribedApplis: notifyResult.unsubscribedApplis,
    failedApplis: notifyResult.failedApplis,
  })
  return jsonResponse({
    ok: true,
    message,
    callbackUrls: notifyResult.callbackUrls,
    unsubscribedApplis: notifyResult.unsubscribedApplis,
    failedApplis: notifyResult.failedApplis,
  })
}

export async function handleWithingsNotifySimulation(request: Request, env: Env) {
  const connection = await getStoredConnection(env)
  if (!connection) {
    return errorResponse('Withings連携が未設定です', 400)
  }

  const url = new URL(request.url)
  const requestedAppli = url.searchParams.get('appli')?.trim() || ''
  const appli = requestedAppli === 'activity' ? WITHINGS_NOTIFY_APPLI_ACTIVITY : WITHINGS_NOTIFY_APPLI_MEASURE
  const activityDateYmd = appli === WITHINGS_NOTIFY_APPLI_ACTIVITY ? toDateYmd(nowSeconds()) : null
  const payload = {
    userId: connection.userId,
    appli,
    startDate: null,
    endDate: null,
    dateYmd: activityDateYmd,
    raw: {
      userid: connection.userId,
      appli: String(appli),
      ...(activityDateYmd ? { date: activityDateYmd } : {}),
      simulated: '1',
    },
  } satisfies WithingsNotificationPayload

  const result = await processWithingsNotify(request, env, payload, {
    authMode: 'simulation',
    dryRun: true,
    repairSubscription: true,
  })
  if (!result.syncOk) {
    await notifyWithingsError(env, 'simulate_notify_failed', '擬似Notifyの同期に失敗しました。', [
      `skipReason: ${result.skipReason ?? '(none)'}`,
    ])
    return errorResponse(buildSimulatedNotifyMessage(result), 502, {
      syncOk: result.syncOk,
      skipReason: result.skipReason,
      subscriptionRepair: result.subscriptionRepair,
    })
  }

  return jsonResponse({
    ok: true,
    dryRun: true,
    message: buildSimulatedNotifyMessage(result),
    latestNewWeightMeasurement: result.latestNewWeightMeasurement,
    skipReason: result.skipReason,
    subscriptionRepair: result.subscriptionRepair,
  })
}
