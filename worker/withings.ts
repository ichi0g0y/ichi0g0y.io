import type { Env } from './types'
import { errorResponse, jsonResponse, nowSeconds, parseCookies } from './utils'
import { postLatestWithingsMeasurementTweet } from './twitter-post'
import type { PostLatestWithingsMeasurementTweetResult } from './twitter-post'
import type { WithingsMeasurementForTweet } from './twitter-types'
import type { WithingsNotificationPayload } from './withings-types'
import {
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
  toFiniteInteger,
  toFiniteNumber,
  validateWithingsOAuthConfig,
  verifySignedWithingsState,
} from './withings-helpers'
import {
  ensureConnectionReady,
  exchangeAuthorizationCode,
  getStoredConnection,
  markNotifySubscription,
  subscribeNotify,
  syncMeasurements,
  upsertConnection,
} from './withings-sync'

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
    raw: rawObject,
  }
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
  const connection = await ensureConnectionReady(env)
  if (!connection) {
    return buildNotifyResult(options.authMode, { skipReason: 'connection_not_found' })
  }

  if (payload.userId && payload.userId !== connection.userId) {
    return buildNotifyResult(options.authMode, {
      skipReason: 'payload_user_mismatch',
      subscriptionRepair: { ...DEFAULT_SUBSCRIPTION_REPAIR, callbackUrl: connection.notifyCallbackUrl },
    })
  }

  const synced = await syncMeasurements(env, connection, payload.startDate, payload.endDate)
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
        console.error(
          '[withings] initial sync threw exception',
          error instanceof Error ? error.stack ?? error.message : String(error),
        )
        return { ok: false, latestNewWeightMeasurement: null }
      }
    }
    if (ctx) {
      ctx.waitUntil(syncInBackground())
    } else {
      const synced = await syncInBackground()
      if (!synced.ok) {
        return redirectToApp(request, env, 'connected', 'withings_sync_failed', [clearWithingsStateCookie(request)])
      }
    }

    if (!notifyResult.ok) {
      return redirectToApp(request, env, 'connected', 'withings_notify_subscribe_failed', [clearWithingsStateCookie(request)])
    }

    return redirectToApp(request, env, 'connected', undefined, [clearWithingsStateCookie(request)])
  } catch (error) {
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

  if (method === 'GET' && url.searchParams.size === 0) {
    return jsonResponse({ ok: true, accepted: true, healthcheck: true })
  }

  if (method === 'POST' && url.searchParams.size === 0) {
    const rawBody = await request
      .clone()
      .text()
      .catch(() => '')
    if (!rawBody.trim()) {
      return jsonResponse({ ok: true, accepted: true, healthcheck: true })
    }
  }

  const payload = await parseNotifyPayload(request)
  const storedConnection = await getStoredConnection(env)
  const notifySecret = env.WITHINGS_NOTIFY_SECRET?.trim() || null
  const token = url.searchParams.get('token')?.trim() || null
  const authMode: WithingsNotifyAuthMode | null =
    notifySecret && token === notifySecret ? 'token' : shouldAllowLegacyNotify(request, storedConnection, payload) ? 'legacy_callback' : null
  if (!authMode) {
    if (!notifySecret) {
      return errorResponse('WITHINGS_NOTIFY_SECRET が未設定です', 401)
    }
    return errorResponse('notify token が不正です', 401)
  }

  const runSync = async () => {
    try {
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
        console.warn('[withings] notify subscription repair failed', {
          callbackUrl: result.subscriptionRepair.callbackUrl,
          error: result.subscriptionRepair.error,
          failedApplis: result.subscriptionRepair.failedApplis,
          usedFallback: result.subscriptionRepair.usedFallback,
        })
      }
    } catch (error) {
      console.error(
        '[withings] notify sync threw exception',
        error instanceof Error ? error.stack ?? error.message : String(error),
      )
    }
  }

  if (ctx) {
    ctx.waitUntil(runSync())
    return jsonResponse({ ok: true, accepted: true })
  }

  await runSync()
  return jsonResponse({ ok: true, accepted: true })
}

export async function handleWithingsSync(env: Env, request?: Request) {
  const configError = validateWithingsOAuthConfig(env)
  if (configError) {
    return errorResponse(configError, 500)
  }

  const connection = await ensureConnectionReady(env)
  if (!connection) {
    return errorResponse('Withings連携が未設定です', 400)
  }

  let startDate: number | null = null
  let endDate: number | null = null
  if (request) {
    const url = new URL(request.url)
    startDate = parseOptionalInteger(url.searchParams.get('startdate'))
    endDate = parseOptionalInteger(url.searchParams.get('enddate'))
  }

  const synced = await syncMeasurements(env, connection, startDate, endDate)
  if (!synced.ok) {
    return errorResponse('Withingsデータの同期に失敗しました', 502)
  }

  let notifySubscription = null
  if (request) {
    const refreshedConnection = await ensureConnectionReady(env)
    if (refreshedConnection) {
      notifySubscription = await repairNotifySubscriptionIfNeeded(request, env, refreshedConnection)
      if (notifySubscription.attempted && !notifySubscription.repaired) {
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

export async function handleWithingsNotifySimulation(request: Request, env: Env) {
  const connection = await getStoredConnection(env)
  if (!connection) {
    return errorResponse('Withings連携が未設定です', 400)
  }

  const payload = {
    userId: connection.userId,
    appli: WITHINGS_NOTIFY_APPLI_MEASURE,
    startDate: null,
    endDate: null,
    raw: {
      userid: connection.userId,
      appli: String(WITHINGS_NOTIFY_APPLI_MEASURE),
      simulated: '1',
    },
  } satisfies WithingsNotificationPayload

  const result = await processWithingsNotify(request, env, payload, {
    authMode: 'simulation',
    dryRun: true,
    repairSubscription: true,
  })
  if (!result.syncOk) {
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
