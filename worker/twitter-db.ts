// Twitter連携のDB操作

import type { Env } from './types'
import { nowSeconds } from './utils'
import type {
  TwitterConnection,
  TwitterConnectionRow,
  TwitterPostSettings,
  TwitterPostSettingsRow,
  TwitterTokenResponse,
  TwitterUser,
  WithingsMeasurementForTweet,
} from './twitter-types'
import { DEFAULT_TWITTER_POST_TEMPLATE } from './twitter-types'

function parseNullableFiniteNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

export function getDefaultTwitterPostTemplate() {
  return DEFAULT_TWITTER_POST_TEMPLATE
}

export function toConnection(row: TwitterConnectionRow): TwitterConnection {
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

export function toSettings(row: TwitterPostSettingsRow): TwitterPostSettings {
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

export async function getStoredTwitterConnection(env: Env) {
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

export async function ensureTwitterPostSettings(env: Env) {
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

export async function upsertTwitterConnection(
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

export async function markTwitterPostPublished(env: Env, measurement: WithingsMeasurementForTweet, tweetId: string | null) {
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
