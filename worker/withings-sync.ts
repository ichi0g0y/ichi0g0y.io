import type { Env } from './types'
import { nowSeconds, sha256Hex } from './utils'
import type { WithingsMeasurementForTweet } from './twitter-types'
import type {
  WorkoutDetailPoint,
  WithingsActivityBody,
  WithingsAnswersBody,
  WithingsApiPayload,
  WithingsConnection,
  WithingsConnectionRow,
  WithingsHeartBody,
  WithingsMeasureBody,
  WithingsNotifyUnsubscribeResult,
  WithingsNotifySubscribeResult,
  WithingsSleepBody,
  WithingsTokenBody,
  WithingsWorkoutForNotification,
} from './withings-types'
import {
  ACCESS_TOKEN_REFRESH_MARGIN_SEC,
  WITHINGS_ANSWERS_V2_URL,
  WITHINGS_HEART_V2_URL,
  WITHINGS_INTRADAY_DATA_FIELDS,
  WITHINGS_MEASURE_BASE_CATEGORIES,
  WITHINGS_MEASURE_URL,
  WITHINGS_MEASURE_V2_URL,
  WITHINGS_NOTIFY_APPLIS,
  WITHINGS_NOTIFY_URL,
  WITHINGS_OAUTH_URL,
  WITHINGS_PAGINATION_MAX_LOOP,
  WITHINGS_SLEEP_DATA_FIELDS,
  WITHINGS_SLEEP_V2_URL,
} from './withings-types'
import {
  appendWithingsNotifySecret,
  buildStructuredValueEntries,
  calculateBmi,
  getOrderedWorkoutDetailPaths,
  getWorkoutDetailMeta,
  getConfiguredHeightM,
  getWithingsCallbackUrl,
  getWithingsNotifyCallbackUrl,
  parseExpiresIn,
  parseUnixFromUnknown,
  resolveHeartSignalId,
  resolveHeightM,
  resolveIncrementalSyncStart,
  resolveNextOffset,
  resolveRawDataKey,
  resolveMeasuredAtFromRecord,
  resolveSyncWindow,
  resolveWithingsMeasureValue,
  resolveWithingsRetentionStart,
  resolveWorkoutDataNumber,
  shouldRetainStructuredPath,
  toConnection,
  toDateYmd,
  toFiniteInteger,
  toFiniteNumber,
  toOptionalInteger,
  toRecord,
  toRecords,
} from './withings-helpers'

type SyncMeasurementsResult = {
  ok: boolean
  latestNewWeightMeasurement: WithingsMeasurementForTweet | null
  latestWorkout: WithingsWorkoutForNotification | null
}

async function upsertStructuredSourceValues(
  env: Env,
  userId: string,
  source: string,
  dataKey: string,
  measuredAt: number | null,
  payload: unknown,
) {
  const now = nowSeconds()
  const entries = buildStructuredValueEntries(payload).filter((entry) => shouldRetainStructuredPath(source, entry.path))

  await env.DB.prepare(
    `
      DELETE FROM withings_source_values
      WHERE userid = ?1 AND source = ?2 AND data_key = ?3
    `,
  )
    .bind(userId, source, dataKey)
    .run()

  if (entries.length < 1) {
    return
  }

  const statements = entries.map((entry) =>
    env.DB.prepare(
      `
        INSERT INTO withings_source_values (
          userid, source, data_key, measured_at, path, value_type,
          value_number, value_text, value_boolean, created_at, updated_at
        )
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?10)
      `,
    ).bind(
      userId,
      source,
      dataKey,
      measuredAt,
      entry.path,
      entry.valueType,
      entry.valueNumber,
      entry.valueText,
      entry.valueBoolean,
      now,
    ),
  )
  await env.DB.batch(statements)
}

async function persistSourceRecords(
  env: Env,
  userId: string,
  source: string,
  records: Record<string, unknown>[],
  offsetBase: number,
) {
  for (const [index, record] of records.entries()) {
    const measuredAt = resolveMeasuredAtFromRecord(record)
    const dataKey = await resolveRawDataKey(record, offsetBase + index, measuredAt)
    await upsertStructuredSourceValues(env, userId, source, dataKey, measuredAt, record)
  }
}

async function postWithingsForm<TBody>(
  url: string,
  params: URLSearchParams,
  accessToken?: string,
): Promise<{ httpStatus: number; payload: WithingsApiPayload<TBody> | null }> {
  const headers = new Headers({ 'Content-Type': 'application/x-www-form-urlencoded' })
  if (accessToken) {
    headers.set('Authorization', `Bearer ${accessToken}`)
  }

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: params.toString(),
  })
  const payload = (await response.json().catch(() => null)) as WithingsApiPayload<TBody> | null
  return { httpStatus: response.status, payload }
}

export async function getStoredConnection(env: Env) {
  const row = await env.DB.prepare(
    `
      SELECT userid, access_token, refresh_token, token_type, scope, access_expires_at, height_m,
             notify_callback_url, notify_subscribed_at, last_synced_at, created_at, updated_at
      FROM withings_connections
      WHERE id = 1
      LIMIT 1
    `,
  ).first<WithingsConnectionRow>()

  if (!row) {
    return null
  }
  return toConnection(row)
}

export async function upsertConnection(
  env: Env,
  tokenBody: WithingsTokenBody,
  notifyCallbackUrl: string | null,
  notifySubscribedAt: number | null,
  heightM: number | null,
) {
  const accessToken = (tokenBody.access_token ?? '').trim()
  const refreshToken = (tokenBody.refresh_token ?? '').trim()
  const userId = String(tokenBody.userid ?? '').trim()
  const expiresIn = parseExpiresIn(tokenBody.expires_in)

  if (!accessToken || !refreshToken || !userId || expiresIn < 1) {
    return null
  }

  const now = nowSeconds()
  const accessExpiresAt = now + expiresIn
  await env.DB.prepare(
    `
      INSERT INTO withings_connections (
        id, userid, access_token, refresh_token, token_type, scope, access_expires_at, height_m,
        notify_callback_url, notify_subscribed_at, last_synced_at, created_at, updated_at
      )
      VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, NULL, ?11, ?11)
      ON CONFLICT(id) DO UPDATE SET
        userid = excluded.userid,
        access_token = excluded.access_token,
        refresh_token = excluded.refresh_token,
        token_type = excluded.token_type,
        scope = excluded.scope,
        access_expires_at = excluded.access_expires_at,
        height_m = excluded.height_m,
        notify_callback_url = excluded.notify_callback_url,
        notify_subscribed_at = excluded.notify_subscribed_at,
        updated_at = excluded.updated_at
    `,
  )
    .bind(
      1,
      userId,
      accessToken,
      refreshToken,
      tokenBody.token_type ?? null,
      tokenBody.scope ?? null,
      accessExpiresAt,
      heightM,
      notifyCallbackUrl,
      notifySubscribedAt,
      now,
    )
    .run()

  return {
    userId,
    accessToken,
    refreshToken,
    tokenType: tokenBody.token_type ?? null,
    scope: tokenBody.scope ?? null,
    accessExpiresAt,
    heightM,
    notifyCallbackUrl,
    notifySubscribedAt,
    lastSyncedAt: null,
  } as WithingsConnection
}

async function markConnectionSyncedAt(env: Env, syncedAt: number) {
  await env.DB.prepare(
    `
      UPDATE withings_connections
      SET last_synced_at = ?1, updated_at = ?1
      WHERE id = 1
    `,
  )
    .bind(syncedAt)
    .run()
}

async function storeConnectionHeightM(env: Env, heightM: number) {
  await env.DB.prepare(
    `
      UPDATE withings_connections
      SET height_m = ?1, updated_at = ?2
      WHERE id = 1
    `,
  )
    .bind(heightM, nowSeconds())
    .run()
}

async function backfillMeasurementBmi(env: Env, userId: string, heightM: number) {
  if (!Number.isFinite(heightM) || heightM <= 0) {
    return
  }

  await env.DB.prepare(
    `
      UPDATE withings_measurements
      SET bmi = CASE
        WHEN weight_kg IS NOT NULL THEN weight_kg / (?2 * ?2)
        ELSE NULL
      END,
      updated_at = ?3
      WHERE userid = ?1
    `,
  )
    .bind(userId, heightM, nowSeconds())
    .run()
}

async function cleanupWithingsData(env: Env, userId: string, endDate: number) {
  const retentionStart = resolveWithingsRetentionStart(endDate)

  const deleteMeasurements = env.DB.prepare(
    `
      DELETE FROM withings_measurements
      WHERE userid = ?1
        AND measured_at < ?2
    `,
  ).bind(userId, retentionStart)

  const deleteWorkouts = env.DB.prepare(
    `
      DELETE FROM withings_workouts
      WHERE userid = ?1
        AND measured_at < ?2
    `,
  ).bind(userId, retentionStart)

  await env.DB.batch([deleteMeasurements, deleteWorkouts])
}

export async function exchangeAuthorizationCode(code: string, request: Request, env: Env) {
  const params = new URLSearchParams()
  params.set('action', 'requesttoken')
  params.set('grant_type', 'authorization_code')
  params.set('client_id', env.WITHINGS_CLIENT_ID!)
  params.set('client_secret', env.WITHINGS_CLIENT_SECRET!)
  params.set('code', code)
  params.set('redirect_uri', getWithingsCallbackUrl(request, env))

  const { payload } = await postWithingsForm<WithingsTokenBody>(WITHINGS_OAUTH_URL, params)
  if (!payload || payload.status !== 0 || !payload.body) {
    return null
  }
  return payload.body
}

async function refreshAccessToken(connection: WithingsConnection, env: Env) {
  const params = new URLSearchParams()
  params.set('action', 'requesttoken')
  params.set('grant_type', 'refresh_token')
  params.set('client_id', env.WITHINGS_CLIENT_ID!)
  params.set('client_secret', env.WITHINGS_CLIENT_SECRET!)
  params.set('refresh_token', connection.refreshToken)

  const { payload } = await postWithingsForm<WithingsTokenBody>(WITHINGS_OAUTH_URL, params)
  if (!payload || payload.status !== 0 || !payload.body) {
    return null
  }
  return payload.body
}

async function getConcurrentRefreshedConnection(
  env: Env,
  previousConnection: WithingsConnection,
  now: number,
) {
  const latestConnection = await getStoredConnection(env)
  if (!latestConnection || latestConnection.userId !== previousConnection.userId) {
    return null
  }

  const credentialsUpdated =
    latestConnection.accessToken !== previousConnection.accessToken ||
    latestConnection.refreshToken !== previousConnection.refreshToken
  if (credentialsUpdated || latestConnection.accessExpiresAt > now + ACCESS_TOKEN_REFRESH_MARGIN_SEC) {
    return latestConnection
  }

  return null
}

export async function ensureConnectionReady(env: Env) {
  const connection = await getStoredConnection(env)
  if (!connection) {
    return null
  }

  const now = nowSeconds()
  if (connection.accessExpiresAt > now + ACCESS_TOKEN_REFRESH_MARGIN_SEC) {
    return connection
  }

  if (!env.WITHINGS_CLIENT_ID?.trim() || !env.WITHINGS_CLIENT_SECRET?.trim()) {
    return connection
  }

  const refreshedTokenBody = await refreshAccessToken(connection, env)
  if (!refreshedTokenBody) {
    const concurrentConnection = await getConcurrentRefreshedConnection(env, connection, now)
    if (concurrentConnection) {
      return concurrentConnection
    }
    return null
  }
  const updatedConnection = await upsertConnection(
    env,
    refreshedTokenBody,
    connection.notifyCallbackUrl,
    connection.notifySubscribedAt,
    connection.heightM,
  )
  if (updatedConnection) {
    return updatedConnection
  }

  const concurrentConnection = await getConcurrentRefreshedConnection(env, connection, now)
  return concurrentConnection ?? null
}

async function postWithingsWithRefresh<TBody>(
  env: Env,
  connection: WithingsConnection,
  url: string,
  paramsFactory: () => URLSearchParams,
) {
  let activeConnection = connection
  let { payload } = await postWithingsForm<TBody>(url, paramsFactory(), activeConnection.accessToken)
  if (payload?.status === 401) {
    const refreshed = await ensureConnectionReady(env)
    if (!refreshed) {
      return { payload, connection: null as WithingsConnection | null }
    }
    activeConnection = refreshed
    const retry = await postWithingsForm<TBody>(url, paramsFactory(), activeConnection.accessToken)
    payload = retry.payload
  }
  return { payload, connection: activeConnection }
}

async function subscribeNotifyForCallbackUrl(
  callbackUrl: string,
  connection: WithingsConnection,
): Promise<{
  ok: boolean
  callbackUrl: string
  status: number | null
  error: string | null
  subscribedApplis: number[]
  failedApplis: number[]
}> {
  const subscribedApplis: number[] = []
  const failedApplis: number[] = []
  let lastStatus: number | null = null
  let lastError: string | null = null

  for (const appli of WITHINGS_NOTIFY_APPLIS) {
    const params = new URLSearchParams()
    params.set('action', 'subscribe')
    params.set('callbackurl', callbackUrl)
    params.set('appli', String(appli))
    params.set('comment', 'ichi0g0y.io')

    const { payload } = await postWithingsForm<Record<string, unknown>>(WITHINGS_NOTIFY_URL, params, connection.accessToken)
    const ok = Boolean(payload && payload.status === 0)
    if (ok) {
      subscribedApplis.push(appli)
      continue
    }
    failedApplis.push(appli)
    lastStatus = typeof payload?.status === 'number' ? payload.status : null
    lastError = payload?.error ?? null
  }

  return {
    ok: subscribedApplis.includes(1),
    callbackUrl,
    status: lastStatus,
    error: lastError,
    subscribedApplis,
    failedApplis,
  }
}

async function unsubscribeNotifyForCallbackUrl(
  callbackUrl: string,
  connection: WithingsConnection,
): Promise<{
  ok: boolean
  callbackUrl: string
  status: number | null
  error: string | null
  unsubscribedApplis: number[]
  failedApplis: number[]
}> {
  const alreadyMissingStatus = 2554
  const unsubscribedApplis: number[] = []
  const alreadyMissingApplis: number[] = []
  const failedApplis: number[] = []
  let lastStatus: number | null = null
  let lastError: string | null = null

  for (const appli of WITHINGS_NOTIFY_APPLIS) {
    const params = new URLSearchParams()
    params.set('action', 'unsubscribe')
    params.set('callbackurl', callbackUrl)
    params.set('appli', String(appli))

    const { payload } = await postWithingsForm<Record<string, unknown>>(WITHINGS_NOTIFY_URL, params, connection.accessToken)
    const status = typeof payload?.status === 'number' ? payload.status : null
    const ok = status === 0
    if (ok) {
      unsubscribedApplis.push(appli)
      continue
    }
    if (status === alreadyMissingStatus) {
      alreadyMissingApplis.push(appli)
      lastStatus = status
      lastError = payload?.error ?? null
      continue
    }
    failedApplis.push(appli)
    lastStatus = status
    lastError = payload?.error ?? null
  }

  return {
    ok: unsubscribedApplis.length > 0 || alreadyMissingApplis.length === WITHINGS_NOTIFY_APPLIS.length,
    callbackUrl,
    status: lastStatus,
    error: lastError,
    unsubscribedApplis,
    failedApplis,
  }
}

export async function subscribeNotify(request: Request, env: Env, connection: WithingsConnection): Promise<WithingsNotifySubscribeResult> {
  const primaryCallbackUrl = getWithingsNotifyCallbackUrl(request, env)
  const primaryResult = await subscribeNotifyForCallbackUrl(primaryCallbackUrl, connection)

  if (primaryResult.ok) {
    return { ...primaryResult, usedFallback: false }
  }

  const fallbackCallbackUrl = appendWithingsNotifySecret(getWithingsCallbackUrl(request, env), env)
  if (fallbackCallbackUrl === primaryCallbackUrl) {
    return { ...primaryResult, usedFallback: false }
  }

  const fallbackResult = await subscribeNotifyForCallbackUrl(fallbackCallbackUrl, connection)
  if (fallbackResult.ok) {
    return { ...fallbackResult, usedFallback: true }
  }

  return {
    ...primaryResult,
    usedFallback: true,
  }
}

export async function unsubscribeNotify(request: Request, env: Env, connection: WithingsConnection): Promise<WithingsNotifyUnsubscribeResult> {
  const callbackUrls = Array.from(
    new Set(
      [
        connection.notifyCallbackUrl?.trim() || null,
        getWithingsNotifyCallbackUrl(request, env),
        appendWithingsNotifySecret(getWithingsCallbackUrl(request, env), env),
      ].filter((value): value is string => Boolean(value?.trim())),
    ),
  )

  const results = await Promise.all(callbackUrls.map((callbackUrl) => unsubscribeNotifyForCallbackUrl(callbackUrl, connection)))
  const successfulResults = results.filter((result) => result.ok)
  const latestResult = results.at(-1) ?? null

  return {
    ok: successfulResults.length > 0,
    callbackUrls,
    status: successfulResults.at(-1)?.status ?? latestResult?.status ?? null,
    error: successfulResults.length > 0 ? null : latestResult?.error ?? null,
    unsubscribedApplis: Array.from(new Set(successfulResults.flatMap((result) => result.unsubscribedApplis))),
    failedApplis: Array.from(new Set(results.flatMap((result) => result.failedApplis))),
  }
}

export async function markNotifySubscription(env: Env, connection: WithingsConnection, callbackUrl: string) {
  const refreshedConnection = await getStoredConnection(env)
  const now = nowSeconds()
  const notifySubscribedAt = now
  const source = refreshedConnection ?? connection
  await env.DB.prepare(
    `
      UPDATE withings_connections
      SET notify_callback_url = ?1, notify_subscribed_at = ?2, updated_at = ?2
      WHERE id = 1
    `,
  )
    .bind(callbackUrl, notifySubscribedAt)
    .run()

  return {
    callbackUrl: callbackUrl || source.notifyCallbackUrl,
    notifySubscribedAt,
  }
}

export async function clearNotifySubscription(env: Env) {
  const now = nowSeconds()
  await env.DB.prepare(
    `
      UPDATE withings_connections
      SET notify_callback_url = NULL, notify_subscribed_at = NULL, updated_at = ?1
      WHERE id = 1
    `,
  )
    .bind(now)
    .run()

  return {
    notifyCallbackUrl: null,
    notifySubscribedAt: null,
  }
}

async function fetchMeasureGroups(
  env: Env,
  connection: WithingsConnection,
  startDate: number | null,
  endDate: number | null,
  category: number,
  offset: number,
  measureType: number | null = null,
) {
  return postWithingsWithRefresh<WithingsMeasureBody>(env, connection, WITHINGS_MEASURE_URL, () => {
    const params = new URLSearchParams()
    params.set('action', 'getmeas')
    params.set('category', String(category))
    if (typeof measureType === 'number' && Number.isFinite(measureType) && measureType > 0) {
      params.set('meastype', String(measureType))
    }
    if (typeof startDate === 'number' && startDate > 0) {
      params.set('startdate', String(startDate))
    }
    if (typeof endDate === 'number' && endDate > 0) {
      params.set('enddate', String(endDate))
    }
    if (offset > 0) {
      params.set('offset', String(offset))
    }
    return params
  })
}

async function syncHistoricalHeightMeasureIfMissing(env: Env, connection: WithingsConnection, endDate: number) {
  const existingHeightM = resolveHeightM(connection, env)
  if (existingHeightM !== null) {
    if (connection.heightM === null && existingHeightM > 0) {
      await storeConnectionHeightM(env, existingHeightM)
      await backfillMeasurementBmi(env, connection.userId, existingHeightM)
      return { ...connection, heightM: existingHeightM }
    }
    return connection
  }

  let activeConnection: WithingsConnection | null = connection
  let offset = 0
  let loop = 0

  while (loop < WITHINGS_PAGINATION_MAX_LOOP) {
    loop += 1
    if (!activeConnection) {
      return null
    }

    const result = await fetchMeasureGroups(env, activeConnection, null, endDate, 1, offset, 4)
    if (!result.connection) {
      return null
    }
    activeConnection = result.connection
    if (!result.payload || result.payload.status !== 0) {
      return activeConnection
    }

    const groups = Array.isArray(result.payload.body?.measuregrps) ? result.payload.body?.measuregrps ?? [] : []
    const now = nowSeconds()
    let discoveredHeightM: number | null = null

    for (const group of groups) {
      const groupId = typeof group.grpid === 'number' ? group.grpid : null
      const measuredAt = typeof group.date === 'number' ? group.date : null
      if (groupId === null || measuredAt === null) {
        continue
      }

      const measures = Array.isArray(group.measures) ? group.measures : []
      for (const [measureIndex, measure] of measures.entries()) {
        const typeId = toOptionalInteger(measure.type)
        if (typeId !== 4) {
          continue
        }
        const resolvedValue = resolveWithingsMeasureValue(measure)
        if (resolvedValue === null) {
          continue
        }
        discoveredHeightM = resolvedValue
        break
      }

      if (discoveredHeightM !== null) {
        break
      }
    }

    if (discoveredHeightM !== null) {
      await storeConnectionHeightM(env, discoveredHeightM)
      await backfillMeasurementBmi(env, activeConnection.userId, discoveredHeightM)
      return {
        ...activeConnection,
        heightM: discoveredHeightM,
      }
    }

    const hasMore = Boolean(result.payload.body?.more)
    if (!hasMore) {
      return activeConnection
    }
    offset = resolveNextOffset(offset, result.payload.body?.offset, groups.length)
  }

  return activeConnection
}

async function syncMeasureGroupsByCategory(
  env: Env,
  connection: WithingsConnection,
  startDate: number | null,
  endDate: number | null,
  category: number,
  persistSummary: boolean,
) {
  let activeConnection: WithingsConnection | null = connection
  let offset = 0
  let loop = 0
  let heightM = resolveHeightM(connection, env)
  let latestNewWeightMeasurement: WithingsMeasurementForTweet | null = null

  while (loop < WITHINGS_PAGINATION_MAX_LOOP) {
    loop += 1
    if (!activeConnection) {
      return { ok: false, connection: null as WithingsConnection | null, latestNewWeightMeasurement }
    }
    const result = await fetchMeasureGroups(env, activeConnection, startDate, endDate, category, offset)
    if (!result.connection) {
      return { ok: false, connection: null as WithingsConnection | null, latestNewWeightMeasurement }
    }
    if (!result.payload || result.payload.status !== 0) {
      return { ok: false, connection: result.connection, latestNewWeightMeasurement }
    }
    activeConnection = result.connection

    const groups = Array.isArray(result.payload.body?.measuregrps) ? result.payload.body?.measuregrps ?? [] : []
    const now = nowSeconds()

    for (const group of groups) {
      const groupId = typeof group.grpid === 'number' ? group.grpid : null
      const measuredAt = typeof group.date === 'number' ? group.date : null
      if (groupId === null || measuredAt === null) {
        continue
      }

      if (!persistSummary) {
        continue
      }

      let weightKg: number | null = null
      let fatRatio: number | null = null
      const measures = Array.isArray(group.measures) ? group.measures : []

      for (const measure of measures) {
        const resolvedValue = resolveWithingsMeasureValue(measure)
        const typeId = toOptionalInteger(measure.type)

        if (resolvedValue === null) {
          continue
        }
        if (typeId === 1) {
          weightKg = resolvedValue
        } else if (typeId === 6) {
          fatRatio = resolvedValue
        } else if (typeId === 4) {
          heightM = resolvedValue
          await storeConnectionHeightM(env, resolvedValue)
          activeConnection = { ...result.connection, heightM: resolvedValue }
        }
      }

      const bmi = calculateBmi(weightKg, heightM)
      const existingMeasurement = persistSummary
        ? await env.DB.prepare(
            `
              SELECT measured_at, weight_kg
              FROM withings_measurements
              WHERE userid = ?1
                AND grpid = ?2
              LIMIT 1
            `,
          )
            .bind(result.connection.userId, groupId)
            .first<{ measured_at: number; weight_kg: number | null }>()
        : null

      await env.DB.prepare(
        `
          INSERT INTO withings_measurements (
            userid, grpid, measured_at, weight_kg, fat_ratio, bmi, created_at, updated_at
          )
          VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?7)
          ON CONFLICT(userid, grpid) DO UPDATE SET
            measured_at = excluded.measured_at,
            weight_kg = excluded.weight_kg,
            fat_ratio = excluded.fat_ratio,
            bmi = excluded.bmi,
            updated_at = excluded.updated_at
        `,
      )
        .bind(
          result.connection.userId,
          groupId,
          measuredAt,
          weightKg,
          fatRatio,
          bmi,
          now,
        )
        .run()

      const isNewWeightMeasurement =
        weightKg !== null &&
        (!existingMeasurement ||
          existingMeasurement.weight_kg === null ||
          existingMeasurement.weight_kg !== weightKg ||
          existingMeasurement.measured_at !== measuredAt)
      if (
        isNewWeightMeasurement &&
        (!latestNewWeightMeasurement ||
          measuredAt > latestNewWeightMeasurement.measuredAt ||
          (measuredAt === latestNewWeightMeasurement.measuredAt && groupId > latestNewWeightMeasurement.grpid))
      ) {
        const previousMeasurement = await env.DB.prepare(
          `
            SELECT weight_kg
            FROM withings_measurements
            WHERE userid = ?1
              AND weight_kg IS NOT NULL
              AND (
                measured_at < ?2
                OR (measured_at = ?2 AND grpid < ?3)
              )
            ORDER BY measured_at DESC, grpid DESC
            LIMIT 1
          `,
        )
          .bind(result.connection.userId, measuredAt, groupId)
          .first<{ weight_kg: number | null }>()
        const previousWeightKg = previousMeasurement?.weight_kg ?? null

        latestNewWeightMeasurement = {
          grpid: groupId,
          measuredAt,
          weightKg,
          weightDiffKg:
            typeof weightKg === 'number' && Number.isFinite(weightKg) && typeof previousWeightKg === 'number'
              ? weightKg - previousWeightKg
              : null,
          fatRatio,
          bmi,
        }
      }
    }

    const hasMore = Boolean(result.payload.body?.more)
    if (!hasMore) {
      return { ok: true, connection: activeConnection, latestNewWeightMeasurement }
    }

    offset = resolveNextOffset(offset, result.payload.body?.offset, groups.length)
  }

  return { ok: false, connection: activeConnection, latestNewWeightMeasurement }
}

async function syncActivityData(
  env: Env,
  connection: WithingsConnection,
  startDate: number | null,
  endDate: number | null,
) {
  const source = 'measure.getactivity'
  const window = resolveSyncWindow(startDate, endDate, startDate)

  let activeConnection: WithingsConnection | null = connection
  let offset = 0
  let loop = 0
  while (loop < WITHINGS_PAGINATION_MAX_LOOP) {
    loop += 1
    if (!activeConnection) {
      return { ok: false, connection: null as WithingsConnection | null }
    }
    const result = await postWithingsWithRefresh<WithingsActivityBody>(env, activeConnection, WITHINGS_MEASURE_V2_URL, () => {
      const params = new URLSearchParams()
      params.set('action', 'getactivity')
      params.set('startdateymd', toDateYmd(window.startDate))
      params.set('enddateymd', toDateYmd(window.endDate))
      params.set('offset', String(offset))
      return params
    })

    if (!result.connection || !result.payload || result.payload.status !== 0) {
      return { ok: false, connection: result.connection }
    }
    activeConnection = result.connection

    const activities = toRecords(result.payload.body?.activities)
    await persistSourceRecords(env, activeConnection.userId, source, activities, offset)

    const hasMore = Boolean(result.payload.body?.more)
    if (!hasMore) {
      break
    }
    offset = resolveNextOffset(offset, result.payload.body?.offset, activities.length)
  }

  return { ok: loop < WITHINGS_PAGINATION_MAX_LOOP, connection: activeConnection }
}

async function syncIntradayActivityData(
  env: Env,
  connection: WithingsConnection,
  startDate: number | null,
  endDate: number | null,
) {
  const source = 'measure.getintradayactivity'
  const window = resolveSyncWindow(startDate, endDate, startDate)

  let activeConnection: WithingsConnection | null = connection
  let offset = 0
  let loop = 0
  while (loop < WITHINGS_PAGINATION_MAX_LOOP) {
    loop += 1
    if (!activeConnection) {
      return { ok: false, connection: null as WithingsConnection | null }
    }
    const result = await postWithingsWithRefresh<WithingsActivityBody>(env, activeConnection, WITHINGS_MEASURE_V2_URL, () => {
      const params = new URLSearchParams()
      params.set('action', 'getintradayactivity')
      params.set('startdate', String(window.startDate))
      params.set('enddate', String(window.endDate))
      params.set('data_fields', WITHINGS_INTRADAY_DATA_FIELDS)
      if (offset > 0) {
        params.set('offset', String(offset))
      }
      return params
    })
    if (!result.connection || !result.payload || result.payload.status !== 0) {
      return { ok: false, connection: result.connection }
    }
    activeConnection = result.connection

    const intradayRows = toRecords(result.payload.body?.series, 'timestamp')
    await persistSourceRecords(env, activeConnection.userId, source, intradayRows, offset)

    const hasMore = Boolean(result.payload.body?.more)
    if (!hasMore) {
      break
    }
    offset = resolveNextOffset(offset, result.payload.body?.offset, intradayRows.length)
  }

  return { ok: loop < WITHINGS_PAGINATION_MAX_LOOP, connection: activeConnection }
}

async function syncWorkoutData(
  env: Env,
  connection: WithingsConnection,
  startDate: number | null,
  endDate: number | null,
) {
  const window = resolveSyncWindow(startDate, endDate, startDate)

  let activeConnection: WithingsConnection | null = connection
  let offset = 0
  let loop = 0
  while (loop < WITHINGS_PAGINATION_MAX_LOOP) {
    loop += 1
    if (!activeConnection) {
      return { ok: false, connection: null as WithingsConnection | null }
    }
    const result = await postWithingsWithRefresh<WithingsActivityBody>(env, activeConnection, WITHINGS_MEASURE_V2_URL, () => {
      const params = new URLSearchParams()
      params.set('action', 'getworkouts')
      params.set('startdateymd', toDateYmd(window.startDate))
      params.set('enddateymd', toDateYmd(window.endDate))
      params.set('offset', String(offset))
      return params
    })

    if (!result.connection || !result.payload || result.payload.status !== 0) {
      return { ok: false, connection: result.connection }
    }
    activeConnection = result.connection

    const workouts = toRecords(result.payload.body?.series ?? result.payload.body?.workouts)
    const now = nowSeconds()
    for (const [index, workout] of workouts.entries()) {
      const measuredAt = resolveMeasuredAtFromRecord(workout)
      const dataKey = await resolveRawDataKey(workout, offset + index, measuredAt)
      const startAt = parseUnixFromUnknown(workout.startdate)
      const endAt = parseUnixFromUnknown(workout.enddate)
      const durationSec =
        toFiniteInteger(resolveWorkoutDataNumber(workout, 'duration')) ??
        (startAt !== null && endAt !== null && endAt > startAt ? endAt - startAt : null)
      const distanceMeters =
        resolveWorkoutDataNumber(workout, 'manual_distance') ?? resolveWorkoutDataNumber(workout, 'distance')
      const caloriesKcal =
        resolveWorkoutDataNumber(workout, 'manual_calories') ?? resolveWorkoutDataNumber(workout, 'calories')
      const dateYmd = typeof workout.date === 'string' && workout.date.trim() ? workout.date.trim() : null
      const timezone = typeof workout.timezone === 'string' && workout.timezone.trim() ? workout.timezone.trim() : null

      await env.DB.prepare(
        `
          INSERT INTO withings_workouts (
            userid, data_key, measured_at, workout_id, category_id, start_at, end_at,
            date_ymd, timezone, duration_sec, distance_m, calories_kcal, steps, intensity,
            created_at, updated_at
          )
          VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?15)
          ON CONFLICT(userid, data_key) DO UPDATE SET
            measured_at = excluded.measured_at,
            workout_id = excluded.workout_id,
            category_id = excluded.category_id,
            start_at = excluded.start_at,
            end_at = excluded.end_at,
            date_ymd = excluded.date_ymd,
            timezone = excluded.timezone,
            duration_sec = excluded.duration_sec,
            distance_m = excluded.distance_m,
            calories_kcal = excluded.calories_kcal,
            steps = excluded.steps,
            intensity = excluded.intensity,
            updated_at = excluded.updated_at
        `,
      )
        .bind(
          activeConnection.userId,
          dataKey,
          measuredAt ?? startAt ?? endAt ?? 0,
          toFiniteInteger(workout.id),
          toFiniteInteger(workout.category),
          startAt,
          endAt,
          dateYmd,
          timezone,
          durationSec,
          distanceMeters,
          caloriesKcal,
          toFiniteInteger(resolveWorkoutDataNumber(workout, 'steps')),
          toFiniteInteger(resolveWorkoutDataNumber(workout, 'intensity')),
          now,
        )
        .run()
    }

    const hasMore = Boolean(result.payload.body?.more)
    if (!hasMore) {
      break
    }
    offset = resolveNextOffset(offset, result.payload.body?.offset, workouts.length)
  }

  return { ok: loop < WITHINGS_PAGINATION_MAX_LOOP, connection: activeConnection }
}

function buildWorkoutDetails(workout: {
  workoutCategoryKey: string | null
  durationSec: number | null
  distanceMeters: number | null
  caloriesKcal: number | null
  steps: number | null
  intensity: number | null
}) {
  const detailByPath = new Map<string, WorkoutDetailPoint>()
  const detailCandidates = [
    ['data.distance', workout.distanceMeters],
    ['data.calories', workout.caloriesKcal],
    ['data.duration', workout.durationSec],
    ['data.steps', workout.steps],
    ['data.intensity', workout.intensity],
  ] as const

  for (const [path, value] of detailCandidates) {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      continue
    }
    const meta = getWorkoutDetailMeta(path)
    detailByPath.set(path, {
      key: path,
      labelJa: meta.labelJa,
      labelEn: meta.labelEn,
      unit: meta.unit,
      value,
      valueText: null,
    })
  }

  const orderedPaths = getOrderedWorkoutDetailPaths(workout.workoutCategoryKey, [...detailByPath.keys()])
  return orderedPaths
    .map((path) => detailByPath.get(path) ?? null)
    .filter((detail): detail is WorkoutDetailPoint => detail !== null)
}

async function getLatestWorkoutForWindow(
  env: Env,
  userId: string,
  startDate: number | null,
  endDate: number | null,
) {
  const row = await env.DB.prepare(
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
        AND (?2 IS NULL OR ww.measured_at >= ?2)
        AND (?3 IS NULL OR ww.measured_at <= ?3)
      ORDER BY ww.measured_at DESC, ww.data_key DESC
      LIMIT 1
    `,
  )
    .bind(userId, startDate, endDate)
    .first<{
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

  if (!row) {
    return null
  }

  const workoutCategoryId = toFiniteInteger(row.category_id)
  const startAt = toFiniteInteger(row.start_at)
  const endAt = toFiniteInteger(row.end_at)
  const detectedDurationSec = toFiniteInteger(row.duration_sec)
  const durationSec = startAt !== null && endAt !== null && endAt > startAt ? endAt - startAt : detectedDurationSec
  const fallbackCategoryLabel = workoutCategoryId === null ? '不明' : `Type #${workoutCategoryId}`
  const fallbackCategoryLabelEn = workoutCategoryId === null ? 'Unknown' : `Type #${workoutCategoryId}`
  const workout = {
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
    durationSec,
    distanceMeters: toFiniteNumber(row.distance_m),
    caloriesKcal: toFiniteNumber(row.calories_kcal),
    steps: toFiniteInteger(row.steps),
    intensity: toFiniteInteger(row.intensity),
  }

  return {
    ...workout,
    details: buildWorkoutDetails(workout),
  } satisfies WithingsWorkoutForNotification
}

async function syncSleepSummaryData(
  env: Env,
  connection: WithingsConnection,
  startDate: number | null,
  endDate: number | null,
) {
  const source = 'sleep.getsummary'
  const window = resolveSyncWindow(startDate, endDate, startDate)

  let activeConnection: WithingsConnection | null = connection
  let offset = 0
  let loop = 0
  while (loop < WITHINGS_PAGINATION_MAX_LOOP) {
    loop += 1
    if (!activeConnection) {
      return { ok: false, connection: null as WithingsConnection | null }
    }
    const result = await postWithingsWithRefresh<WithingsSleepBody>(env, activeConnection, WITHINGS_SLEEP_V2_URL, () => {
      const params = new URLSearchParams()
      params.set('action', 'getsummary')
      params.set('startdateymd', toDateYmd(window.startDate))
      params.set('enddateymd', toDateYmd(window.endDate))
      params.set('offset', String(offset))
      return params
    })

    if (!result.connection || !result.payload || result.payload.status !== 0) {
      return { ok: false, connection: result.connection }
    }
    activeConnection = result.connection

    const summaryRows = toRecords(result.payload.body?.series)
    await persistSourceRecords(env, activeConnection.userId, source, summaryRows, offset)

    const hasMore = Boolean(result.payload.body?.more)
    if (!hasMore) {
      break
    }
    offset = resolveNextOffset(offset, result.payload.body?.offset, summaryRows.length)
  }

  return { ok: loop < WITHINGS_PAGINATION_MAX_LOOP, connection: activeConnection }
}

async function syncSleepData(
  env: Env,
  connection: WithingsConnection,
  startDate: number | null,
  endDate: number | null,
) {
  const source = 'sleep.get'
  const window = resolveSyncWindow(startDate, endDate, startDate)

  let activeConnection: WithingsConnection | null = connection
  let offset = 0
  let loop = 0
  while (loop < WITHINGS_PAGINATION_MAX_LOOP) {
    loop += 1
    if (!activeConnection) {
      return { ok: false, connection: null as WithingsConnection | null }
    }
    const result = await postWithingsWithRefresh<WithingsSleepBody>(env, activeConnection, WITHINGS_SLEEP_V2_URL, () => {
      const params = new URLSearchParams()
      params.set('action', 'get')
      params.set('startdate', String(window.startDate))
      params.set('enddate', String(window.endDate))
      params.set('startdateymd', toDateYmd(window.startDate))
      params.set('enddateymd', toDateYmd(window.endDate))
      params.set('data_fields', WITHINGS_SLEEP_DATA_FIELDS)
      if (offset > 0) {
        params.set('offset', String(offset))
      }
      return params
    })
    if (!result.connection || !result.payload || result.payload.status !== 0) {
      return { ok: false, connection: result.connection }
    }
    activeConnection = result.connection

    const sleepRows = toRecords(result.payload.body?.series ?? result.payload.body?.sleep)
    await persistSourceRecords(env, activeConnection.userId, source, sleepRows, offset)

    const hasMore = Boolean(result.payload.body?.more)
    if (!hasMore) {
      break
    }
    offset = resolveNextOffset(offset, result.payload.body?.offset, sleepRows.length)
  }

  return { ok: loop < WITHINGS_PAGINATION_MAX_LOOP, connection: activeConnection }
}

async function syncHeartData(
  env: Env,
  connection: WithingsConnection,
  startDate: number | null,
  endDate: number | null,
) {
  const sourceList = 'heart.list'
  const sourceDetail = 'heart.get'
  const window = resolveSyncWindow(startDate, endDate, startDate)

  let activeConnection: WithingsConnection | null = connection
  let offset = 0
  let loop = 0
  const signalIds = new Set<string>()

  while (loop < WITHINGS_PAGINATION_MAX_LOOP) {
    loop += 1
    if (!activeConnection) {
      return { ok: false, connection: null as WithingsConnection | null }
    }
    const result = await postWithingsWithRefresh<WithingsHeartBody>(env, activeConnection, WITHINGS_HEART_V2_URL, () => {
      const params = new URLSearchParams()
      params.set('action', 'list')
      params.set('startdate', String(window.startDate))
      params.set('enddate', String(window.endDate))
      if (offset > 0) {
        params.set('offset', String(offset))
      }
      return params
    })
    if (!result.connection || !result.payload || result.payload.status !== 0) {
      return { ok: false, connection: result.connection }
    }
    activeConnection = result.connection

    const rows = toRecords(result.payload.body?.series)
    await persistSourceRecords(env, activeConnection.userId, sourceList, rows, offset)
    for (const row of rows) {
      const signalId = resolveHeartSignalId(row)
      if (signalId) {
        signalIds.add(signalId)
      }
    }

    const hasMore = Boolean(result.payload.body?.more)
    if (!hasMore) {
      break
    }
    offset = resolveNextOffset(offset, result.payload.body?.offset, rows.length)
  }

  for (const signalId of signalIds) {
    if (!activeConnection) {
      return { ok: false, connection: null as WithingsConnection | null }
    }
    const result = await postWithingsWithRefresh<WithingsHeartBody>(env, activeConnection, WITHINGS_HEART_V2_URL, () => {
      const params = new URLSearchParams()
      params.set('action', 'get')
      params.set('signalid', signalId)
      return params
    })
    if (!result.connection) {
      return { ok: false, connection: null as WithingsConnection | null }
    }
    activeConnection = result.connection
    if (!result.payload || result.payload.status !== 0 || !result.payload.body) {
      continue
    }

    const bodyRecord = toRecord(result.payload.body) ?? {
      signalid: signalId,
      payload: result.payload.body,
    }
    const measuredAt = resolveMeasuredAtFromRecord(bodyRecord)
    await upsertStructuredSourceValues(env, activeConnection.userId, sourceDetail, `signalid:${signalId}`, measuredAt, bodyRecord)
  }

  return { ok: loop < WITHINGS_PAGINATION_MAX_LOOP, connection: activeConnection }
}

async function syncAnswersData(
  env: Env,
  connection: WithingsConnection,
  startDate: number | null,
  endDate: number | null,
) {
  const source = 'answers.get'
  const window = resolveSyncWindow(startDate, endDate, startDate)

  let activeConnection: WithingsConnection | null = connection
  let offset = 0
  let loop = 0
  while (loop < WITHINGS_PAGINATION_MAX_LOOP) {
    loop += 1
    if (!activeConnection) {
      return { ok: false, connection: null as WithingsConnection | null }
    }
    const result = await postWithingsWithRefresh<WithingsAnswersBody>(env, activeConnection, WITHINGS_ANSWERS_V2_URL, () => {
      const params = new URLSearchParams()
      params.set('action', 'get')
      params.set('startdate', String(window.startDate))
      params.set('enddate', String(window.endDate))
      if (offset > 0) {
        params.set('offset', String(offset))
      }
      return params
    })
    if (!result.connection || !result.payload || result.payload.status !== 0) {
      return { ok: false, connection: result.connection }
    }
    activeConnection = result.connection

    const answers = toRecords(result.payload.body?.answers ?? result.payload.body?.series)
    await persistSourceRecords(env, activeConnection.userId, source, answers, offset)

    const hasMore = Boolean(result.payload.body?.more)
    if (!hasMore) {
      break
    }
    offset = resolveNextOffset(offset, result.payload.body?.offset, answers.length)
  }

  return { ok: loop < WITHINGS_PAGINATION_MAX_LOOP, connection: activeConnection }
}

export async function syncMeasurements(
  env: Env,
  connection: WithingsConnection,
  startDate: number | null,
  endDate: number | null,
): Promise<SyncMeasurementsResult> {
  const preResolvedEnd = typeof endDate === 'number' && endDate > 0 ? endDate : nowSeconds()
  const fallbackStart = resolveIncrementalSyncStart(connection.lastSyncedAt, preResolvedEnd)
  const window = resolveSyncWindow(startDate, endDate, fallbackStart)
  let activeConnection: WithingsConnection | null = connection
  let latestNewWeightMeasurement: WithingsMeasurementForTweet | null = null
  let latestWorkout: WithingsWorkoutForNotification | null = null

  for (const category of WITHINGS_MEASURE_BASE_CATEGORIES) {
    if (!activeConnection) {
      return { ok: false, latestNewWeightMeasurement, latestWorkout }
    }
    const synced = await syncMeasureGroupsByCategory(
      env,
      activeConnection,
      window.startDate,
      window.endDate,
      category,
      category === 1,
    )
    if (!synced.connection) {
      return { ok: false, latestNewWeightMeasurement, latestWorkout }
    }
    activeConnection = synced.connection
    if (!synced.ok) {
      return { ok: false, latestNewWeightMeasurement, latestWorkout }
    }
    if (
      synced.latestNewWeightMeasurement &&
      (!latestNewWeightMeasurement ||
        synced.latestNewWeightMeasurement.measuredAt > latestNewWeightMeasurement.measuredAt ||
        (synced.latestNewWeightMeasurement.measuredAt === latestNewWeightMeasurement.measuredAt &&
          synced.latestNewWeightMeasurement.grpid > latestNewWeightMeasurement.grpid))
    ) {
      latestNewWeightMeasurement = synced.latestNewWeightMeasurement
    }
  }

  const optionalSyncFunctions = [
    syncWorkoutData,
  ]

  for (const syncFn of optionalSyncFunctions) {
    if (!activeConnection) {
      return { ok: false, latestNewWeightMeasurement, latestWorkout }
    }
    const synced = await syncFn(env, activeConnection, window.startDate, window.endDate)
    if (!synced.connection) {
      return { ok: false, latestNewWeightMeasurement, latestWorkout }
    }
    activeConnection = synced.connection
    if (!synced.ok) {
      return { ok: false, latestNewWeightMeasurement, latestWorkout }
    }
  }

  if (activeConnection) {
    latestWorkout = await getLatestWorkoutForWindow(env, activeConnection.userId, window.startDate, window.endDate)
  }

  if (activeConnection) {
    const heightSyncedConnection = await syncHistoricalHeightMeasureIfMissing(env, activeConnection, window.endDate)
    if (heightSyncedConnection) {
      activeConnection = heightSyncedConnection
    }
  }

  if (activeConnection) {
    await cleanupWithingsData(env, activeConnection.userId, window.endDate)
  }

  await markConnectionSyncedAt(env, nowSeconds())
  return { ok: true, latestNewWeightMeasurement, latestWorkout }
}
