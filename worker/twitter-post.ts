// ツイート投稿・メディアアップロード・テンプレート処理

import { renderWithingsChartPng } from './withings-chart'
import type { Env } from './types'
import type { CreateTwitterPostOptions, WithingsMeasurementForTweet } from './twitter-types'
import {
  TWITTER_CREATE_TWEET_URL,
  TWITTER_MEDIA_UPLOAD_INITIALIZE_URL,
  TWITTER_POST_MAX_LENGTH,
  JST_TIME_ZONE,
} from './twitter-types'
import { getStoredTwitterConnection, ensureTwitterPostSettings, upsertTwitterConnection, markTwitterPostPublished } from './twitter-db'
import { ensureTwitterConnectionReady, hasTwitterWriteScope, hasTwitterMediaWriteScope, refreshTwitterAuthorization } from './twitter-oauth'

export type CreateTwitterPostResult =
  | {
      ok: true
      tweetId: string | null
      mode: 'with_image' | 'text_only'
    }
  | {
      ok: false
      reason:
        | 'connection_not_found'
        | 'missing_tweet_write_scope'
        | 'measurement_not_found'
        | 'outside_window'
        | 'already_posted'
        | 'empty_text'
        | 'tweet_too_long'
        | 'missing_media_write_scope'
        | 'image_upload_failed'
        | 'chart_generation_failed'
        | 'post_failed'
    }

export type PostLatestWithingsMeasurementTweetResult =
  | CreateTwitterPostResult
  | {
      ok: false
      reason: 'auto_post_disabled'
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

async function getWithingsMeasurementForTweet(
  env: Env,
  userId?: string | null,
  targetGroupId?: number | null,
) {
  const hasTargetGroupId = typeof targetGroupId === 'number' && Number.isFinite(targetGroupId)
  const sql = hasTargetGroupId
    ? userId
      ? `
        SELECT grpid, measured_at, weight_kg, fat_ratio, bmi
        FROM withings_measurements
        WHERE userid = ?1
          AND grpid = ?2
          AND weight_kg IS NOT NULL
        LIMIT 1
      `
      : `
        SELECT grpid, measured_at, weight_kg, fat_ratio, bmi
        FROM withings_measurements
        WHERE grpid = ?1
          AND weight_kg IS NOT NULL
        LIMIT 1
      `
    : userId
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
  const query = hasTargetGroupId
    ? userId
      ? statement.bind(userId, targetGroupId)
      : statement.bind(targetGroupId)
    : userId
      ? statement.bind(userId)
      : statement
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

export async function createTwitterPost(env: Env, options: CreateTwitterPostOptions): Promise<CreateTwitterPostResult> {
  const connection = await getStoredTwitterConnection(env)
  if (!connection) {
    return { ok: false, reason: 'connection_not_found' as const }
  }
  if (!hasTwitterWriteScope(connection.scope)) {
    return { ok: false, reason: 'missing_tweet_write_scope' as const }
  }

  const measurement = await getWithingsMeasurementForTweet(
    env,
    options.withingsUserId ?? null,
    options.targetGroupId ?? null,
  )
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
  targetGroupId?: number | null,
  minMeasuredAt?: number | null,
  maxMeasuredAt?: number | null,
): Promise<PostLatestWithingsMeasurementTweetResult> {
  const settings = await ensureTwitterPostSettings(env)
  if (!settings.autoPostEnabled) {
    return { ok: false, reason: 'auto_post_disabled' }
  }
  return createTwitterPost(env, {
    template: settings.template,
    withingsUserId,
    targetGroupId,
    minMeasuredAt,
    maxMeasuredAt,
    updatePostedMarker: true,
    requireImage: true,
  })
}
